// Serialização, validação e CSV da carteira. A parte de navegador (localStorage) fica no fim e é fina.
import { validarLancamento } from "./carteira.js";
import { validarAlerta } from "./alertas.js";

export const VERSAO = 1;
const MAX_ITENS = 20000;
const MAX_BYTES = 5 * 1024 * 1024;
export const CHAVE = "lastro:v1";

export const vazio = () => ({ versao: VERSAO, lancamentos: [], alertas: [], ultimoBackup: null });

/** Entrada não confiável (arquivo importado ou localStorage). Devolve { dados } ou { erro }. */
export function lerJson(texto) {
  if (typeof texto !== "string" || texto.length > MAX_BYTES) return { erro: "Arquivo grande demais ou ilegível." };
  let bruto;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { erro: "O arquivo não é um JSON válido." };
  }
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return { erro: "Formato inesperado." };
  if (bruto.versao !== VERSAO) return { erro: `Versão ${String(bruto.versao).slice(0, 10)} não suportada.` };
  if (!Array.isArray(bruto.lancamentos) || !Array.isArray(bruto.alertas)) return { erro: "Faltam lançamentos ou alertas." };
  if (bruto.lancamentos.length > MAX_ITENS || bruto.alertas.length > MAX_ITENS) return { erro: "Itens demais." };

  const ids = new Set();
  const lancamentos = [];
  for (const [i, l] of bruto.lancamentos.entries()) {
    const erros = validarLancamento(l);
    if (erros.length) return { erro: `Lançamento ${i + 1}: ${erros[0]}` };
    if (ids.has(l.id)) return { erro: `Lançamento ${i + 1}: identificador repetido.` };
    ids.add(l.id);
    lancamentos.push(copiarLancamento(l));
  }
  const alertas = [];
  for (const [i, a] of bruto.alertas.entries()) {
    const erros = validarAlerta(a);
    if (erros.length) return { erro: `Alerta ${i + 1}: ${erros[0]}` };
    alertas.push({ id: a.id, simbolo: a.simbolo, direcao: a.direcao, precoCentavos: a.precoCentavos, disparadoEm: a.disparadoEm });
  }
  const ultimoBackup = typeof bruto.ultimoBackup === "string" ? bruto.ultimoBackup.slice(0, 40) : null;
  return { dados: { versao: VERSAO, lancamentos, alertas, ultimoBackup } };
}

// Copia só os campos conhecidos (nada extra do arquivo entra no estado).
function copiarLancamento(l) {
  const base = { id: l.id, tipo: l.tipo, simbolo: l.simbolo, data: l.data };
  if (l.tipo === "provento") return { ...base, valorCentavos: l.valorCentavos, subtipo: l.subtipo };
  return { ...base, quantidade: l.quantidade, precoCentavos: l.precoCentavos, taxasCentavos: l.taxasCentavos };
}

export const paraJson = (dados) => JSON.stringify(dados, null, 2);

const celula = (v) => {
  let s = String(v ?? "");
  // Planilhas executam texto que começa com = + - @ (injeção de fórmula): neutraliza.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const reais = (c) => (c / 100).toFixed(2).replace(".", ",");

export function paraCsv(lancamentos) {
  const linhas = [["data", "tipo", "simbolo", "quantidade", "preco", "taxas", "valor", "subtipo"].join(";")];
  for (const l of lancamentos) {
    linhas.push(
      [
        l.data,
        l.tipo,
        l.simbolo,
        l.quantidade ?? "",
        l.precoCentavos != null ? reais(l.precoCentavos) : "",
        l.taxasCentavos != null ? reais(l.taxasCentavos) : "",
        l.valorCentavos != null ? reais(l.valorCentavos) : "",
        l.subtipo ?? "",
      ]
        .map(celula)
        .join(";"),
    );
  }
  return linhas.join("\r\n");
}

// --- navegador ---

export function carregar(storage = globalThis.localStorage) {
  try {
    const texto = storage.getItem(CHAVE);
    if (!texto) return vazio();
    const r = lerJson(texto);
    return r.dados ?? vazio();
  } catch {
    return vazio();
  }
}

/** true se salvou; false se o navegador recusou (cota cheia, modo privado). */
export function salvar(dados, storage = globalThis.localStorage) {
  try {
    storage.setItem(CHAVE, paraJson(dados));
    return true;
  } catch {
    return false;
  }
}
