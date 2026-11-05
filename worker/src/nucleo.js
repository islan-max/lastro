// Lógica do Worker de cotações, sem dependência do ambiente Cloudflare (kv e brapi são injetados).
//
// Regras (plano gratuito da brapi: 15.000 req/mês, 1 ativo por requisição, 1 requisição simultânea):
//  - cache compartilhado em KV; durante o pregão vale ~30 min; fora dele vale até o próximo pregão;
//  - busca uma por vez, no máximo `limiteBuscas` por chamada; o resto volta em `pendentes`;
//  - teto mensal e teto por hora de chamadas à brapi; acima disso só serve cache;
//  - símbolo inexistente é guardado (cache negativo) para não gastar cota repetindo.

export const SIMBOLO_RE = /^[A-Z]{4}\d{1,2}$/;
export const TTL_PREGAO_MS = 30 * 60 * 1000;
export const TTL_NEGATIVO_MS = 24 * 60 * 60 * 1000;
export const TETO_MENSAL = 12_000; // folga sobre os 15.000 do plano
export const TETO_HORA = 40;
export const MAX_SIMBOLOS = 20;
export const LIMITE_BUSCAS = 3;
const BRT = -3 * 3600 * 1000; // sem horário de verão desde 2019

/** Pregão aproximado: segunda a sexta, 10h às 18h (Brasília). Feriados não são tratados. */
export function emPregao(ms) {
  const d = new Date(ms + BRT);
  const dia = d.getUTCDay();
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return dia >= 1 && dia <= 5 && h >= 10 && h < 18;
}

/** Último instante (ms) em que o pregão fechou: 18h de um dia útil, no passado ou agora. */
export function ultimoFechamento(ms) {
  const d = new Date(ms + BRT);
  d.setUTCHours(18, 0, 0, 0);
  let t = d.getTime() - BRT;
  while (t > ms || [0, 6].includes(new Date(t + BRT).getUTCDay())) t -= 24 * 3600 * 1000;
  return t;
}

const mesChave = (ms) => `cota:${new Date(ms + BRT).toISOString().slice(0, 7)}`;
const horaChave = (ms) => `hora:${new Date(ms + BRT).toISOString().slice(0, 13)}`;

function fresco(e, agora) {
  if (e.negativo) return agora - e.buscadoEm < TTL_NEGATIVO_MS;
  if (emPregao(agora)) return agora - e.buscadoEm < TTL_PREGAO_MS;
  return e.buscadoEm >= ultimoFechamento(agora);
}

export function validarSimbolos(texto) {
  if (typeof texto !== "string" || texto.length === 0 || texto.length > 200) return null;
  const lista = [...new Set(texto.split(","))];
  if (lista.length > MAX_SIMBOLOS || !lista.every((s) => SIMBOLO_RE.test(s))) return null;
  return lista;
}

async function lerNumero(kv, chave) {
  const v = await kv.get(chave);
  return v === null ? 0 : Number(v) || 0;
}

/**
 * @param {{ simbolos: string[], agora: number, kv: {get,put}, buscarBrapi: (s:string)=>Promise<object> }} p
 * `buscarBrapi` devolve { status, retryAfter?, preco?, horario? } e nunca lança.
 */
export async function obterCotacoes({ simbolos, agora, kv, buscarBrapi }) {
  const cotacoes = {};
  const erros = {};
  const pendentes = [];
  let buscas = 0;
  let pausado = Number(await kv.get("pausa")) > agora;

  for (const s of simbolos) {
    const bruto = await kv.get(`q:${s}`);
    const e = bruto ? JSON.parse(bruto) : null;
    if (e && fresco(e, agora)) {
      if (e.negativo) erros[s] = e.negativo;
      else cotacoes[s] = montar(e);
      continue;
    }
    // Precisa buscar. Antes, vê se pode.
    const mes = await lerNumero(kv, mesChave(agora));
    const hora = await lerNumero(kv, horaChave(agora));
    const semCota = mes >= TETO_MENSAL;
    const podeBuscar = !pausado && !semCota && hora < TETO_HORA && buscas < LIMITE_BUSCAS;
    if (!podeBuscar) {
      if (e && !e.negativo) cotacoes[s] = montar(e, true); // dado velho é melhor que nada, rotulado
      else if (semCota) erros[s] = "A cota mensal do serviço de cotações acabou. Use o modo demonstração.";
      else pendentes.push(s);
      continue;
    }
    buscas += 1;
    await kv.put(mesChave(agora), String(mes + 1), { expirationTtl: 40 * 86400 });
    await kv.put(horaChave(agora), String(hora + 1), { expirationTtl: 2 * 3600 });
    const r = await buscarBrapi(s);
    if (r.status === 200 && Number.isFinite(r.preco) && r.preco > 0) {
      const novo = { precoCentavos: Math.round(r.preco * 100), horario: r.horario, buscadoEm: agora };
      await kv.put(`q:${s}`, JSON.stringify(novo), { expirationTtl: 7 * 86400 });
      cotacoes[s] = montar(novo);
    } else if (r.status === 404) {
      await kv.put(`q:${s}`, JSON.stringify({ negativo: "Ativo não encontrado.", buscadoEm: agora }), { expirationTtl: 86400 });
      erros[s] = "Ativo não encontrado.";
    } else if (r.status === 401 || r.status === 403) {
      erros[s] = "Este ativo não está disponível no plano gratuito do serviço de cotações.";
    } else if (r.status === 429) {
      pausado = true;
      const espera = Math.min(Math.max(Number(r.retryAfter) || 60, 5), 300);
      await kv.put("pausa", String(agora + espera * 1000), { expirationTtl: 600 });
      if (e && !e.negativo) cotacoes[s] = montar(e, true);
      else pendentes.push(s);
    } else {
      if (e && !e.negativo) cotacoes[s] = montar(e, true);
      else erros[s] = "Serviço de cotações indisponível agora.";
    }
  }
  return { cotacoes, erros, pendentes };
}

function montar(e, velho = false) {
  const origem = emPregao(e.buscadoEm) ? "atrasado" : "fechamento";
  return { precoCentavos: e.precoCentavos, horario: e.horario, origem, ...(velho ? { desatualizado: true } : {}) };
}

// Limite por visitante: contador em memória do isolate (não é global; ver docs/LIMITES.md).
export function criarLimitador(max = 30, janelaMs = 60_000) {
  const mapa = new Map();
  return (chave, agora) => {
    for (const [k, v] of mapa) if (agora - v.inicio > janelaMs) mapa.delete(k);
    if (mapa.size > 5000) mapa.clear();
    const v = mapa.get(chave);
    if (!v || agora - v.inicio > janelaMs) {
      mapa.set(chave, { inicio: agora, n: 1 });
      return true;
    }
    v.n += 1;
    return v.n <= max;
  };
}
