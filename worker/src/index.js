// Cloudflare Worker: cache compartilhado de cotações da brapi para o Lastro.
// Segredo: BRAPI_TOKEN (wrangler secret put BRAPI_TOKEN). Binding KV: COTACOES.
// Variável: ORIGENS_PERMITIDAS (ex.: "https://islan-max.github.io").
// Só símbolos chegam aqui: nada da carteira do usuário (quantidades, preços, datas) é enviado.
import { criarLimitador, obterCotacoes, validarSimbolos } from "./nucleo.js";

const limitar = criarLimitador();

function cabecalhos(origem, permitidas) {
  const h = {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "public, max-age=30",
    vary: "Origin",
  };
  if (origem && permitidas.includes(origem)) h["access-control-allow-origin"] = origem;
  return h;
}

const json = (corpo, status, h) => new Response(JSON.stringify(corpo), { status, headers: h });

async function buscarBrapi(simbolo, token) {
  try {
    const r = await fetch(`https://brapi.dev/api/quote/${simbolo}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status !== 200) return { status: r.status, retryAfter: r.headers.get("retry-after") };
    const dados = await r.json();
    const q = dados?.results?.[0];
    return { status: 200, preco: Number(q?.regularMarketPrice), horario: typeof q?.regularMarketTime === "string" ? q.regularMarketTime : new Date().toISOString() };
  } catch {
    return { status: 599 };
  }
}

export default {
  async fetch(req, env) {
    const permitidas = (env.ORIGENS_PERMITIDAS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const h = cabecalhos(req.headers.get("origin"), permitidas);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...h, "access-control-allow-methods": "GET", "access-control-max-age": "600" } });
    if (req.method !== "GET") return json({ erro: "Método não permitido." }, 405, h);

    const url = new URL(req.url);
    if (url.pathname === "/saude") return json({ ok: true }, 200, h);
    if (url.pathname !== "/cotacoes") return json({ erro: "Não encontrado." }, 404, h);

    const agora = Date.now();
    if (!limitar(req.headers.get("cf-connecting-ip") ?? "?", agora)) return json({ erro: "Muitas requisições. Tente de novo em instantes." }, 429, { ...h, "retry-after": "60" });
    const simbolos = validarSimbolos(url.searchParams.get("s"));
    if (!simbolos) return json({ erro: "Parâmetro s inválido: até 20 símbolos como PETR4,HGLG11." }, 400, h);
    if (!env.BRAPI_TOKEN) return json({ erro: "Serviço sem configuração." }, 503, h);

    const r = await obterCotacoes({ simbolos, agora, kv: env.COTACOES, buscarBrapi: (s) => buscarBrapi(s, env.BRAPI_TOKEN) });
    return json({ ...r, geradoEm: new Date(agora).toISOString() }, 200, h);
  },
};
