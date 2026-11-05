// Núcleo de cálculo da carteira. Puro (sem DOM, sem rede). Dinheiro em centavos inteiros.
//
// Lançamento:
//   compra/venda: { id, tipo, simbolo, data: "AAAA-MM-DD", quantidade, precoCentavos, taxasCentavos }
//   provento:     { id, tipo: "provento", simbolo, data, valorCentavos, subtipo: dividendo|jcp|rendimento }
//
// Fora do escopo (documentado em docs/LIMITES.md): imposto de renda, desdobramento/grupamento/
// bonificação, rentabilidade ponderada pelo tempo.

import { SIMBOLO_RE } from "./simbolo.js";

export const SUBTIPOS_PROVENTO = ["dividendo", "jcp", "rendimento"];
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QTD = 1e9;
const MAX_CENTAVOS = Number.MAX_SAFE_INTEGER / 1e10;

const inteiroPositivo = (n, max) => Number.isSafeInteger(n) && n > 0 && n <= max;
const inteiroNaoNegativo = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;

function dataValida(s) {
  if (typeof s !== "string" || !DATA_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** Lista de mensagens de erro (vazia se o lançamento é válido). Não olha o saldo. */
export function validarLancamento(l) {
  const erros = [];
  if (!l || typeof l !== "object") return ["Lançamento inválido."];
  if (typeof l.id !== "string" || l.id.length === 0 || l.id.length > 64) erros.push("Identificador inválido.");
  if (typeof l.simbolo !== "string" || !SIMBOLO_RE.test(l.simbolo)) erros.push("Símbolo inválido (ex.: PETR4, HGLG11).");
  if (!dataValida(l.data)) erros.push("Data inválida.");
  if (l.tipo === "compra" || l.tipo === "venda") {
    if (!inteiroPositivo(l.quantidade, MAX_QTD)) erros.push("A quantidade deve ser um número inteiro maior que zero.");
    if (!inteiroPositivo(l.precoCentavos, MAX_CENTAVOS)) erros.push("O preço deve ser maior que zero.");
    if (!inteiroNaoNegativo(l.taxasCentavos, MAX_CENTAVOS)) erros.push("As taxas não podem ser negativas.");
  } else if (l.tipo === "provento") {
    if (!inteiroPositivo(l.valorCentavos, MAX_CENTAVOS)) erros.push("O valor do provento deve ser maior que zero.");
    if (!SUBTIPOS_PROVENTO.includes(l.subtipo)) erros.push("Tipo de provento inválido.");
  } else {
    erros.push("Tipo de lançamento inválido.");
  }
  return erros;
}

function ordenar(lancamentos) {
  // Estável: mesma data mantém a ordem em que foi lançado; na mesma data, compras antes de vendas.
  const peso = { compra: 0, provento: 1, venda: 2 };
  return lancamentos
    .map((l, i) => [l, i])
    .sort((a, b) => a[0].data.localeCompare(b[0].data) || peso[a[0].tipo] - peso[b[0].tipo] || a[1] - b[1])
    .map(([l]) => l);
}

/**
 * Processa os lançamentos em ordem cronológica.
 * Devolve { posicoes: { SIMBOLO: {...} }, erros: [{ id, mensagem }] }.
 * Uma venda maior que a posição é recusada (não altera nada) e vira erro.
 */
export function calcular(lancamentos) {
  const posicoes = {};
  const erros = [];
  const obter = (s) =>
    (posicoes[s] ??= { simbolo: s, quantidade: 0, custoCentavos: 0, realizadoCentavos: 0, proventosCentavos: 0, investidoCentavos: 0 });

  for (const l of ordenar(lancamentos)) {
    const p = obter(l.simbolo);
    if (l.tipo === "compra") {
      const custo = l.quantidade * l.precoCentavos + l.taxasCentavos;
      p.quantidade += l.quantidade;
      p.custoCentavos += custo;
      p.investidoCentavos += custo;
    } else if (l.tipo === "venda") {
      if (l.quantidade > p.quantidade) {
        erros.push({ id: l.id, mensagem: `Venda de ${l.quantidade} ${l.simbolo} em ${l.data} maior que a posição (${p.quantidade}).` });
        continue;
      }
      // Toda a posição: sem resíduo de arredondamento.
      const custoSaida = l.quantidade === p.quantidade ? p.custoCentavos : Math.round((p.custoCentavos * l.quantidade) / p.quantidade);
      const receita = l.quantidade * l.precoCentavos - l.taxasCentavos;
      p.realizadoCentavos += receita - custoSaida;
      p.custoCentavos -= custoSaida;
      p.quantidade -= l.quantidade;
    } else if (l.tipo === "provento") {
      p.proventosCentavos += l.valorCentavos;
    }
  }
  for (const p of Object.values(posicoes)) {
    p.precoMedioCentavos = p.quantidade > 0 ? p.custoCentavos / p.quantidade : null; // fracionário: não arredondado
  }
  return { posicoes, erros };
}

/**
 * Junta posições e cotações { SIMBOLO: precoCentavos }.
 * Ativo sem cotação fica com valorAtual = null (e não entra nos totais de valor de mercado).
 */
export function resumir(posicoes, cotacoes) {
  const linhas = [];
  const total = { custoCentavos: 0, valorAtualCentavos: 0, naoRealizadoCentavos: 0, realizadoCentavos: 0, proventosCentavos: 0, investidoCentavos: 0, semCotacao: 0 };

  for (const p of Object.values(posicoes)) {
    const preco = cotacoes[p.simbolo];
    const aberta = p.quantidade > 0;
    let valorAtual = null;
    let naoRealizado = null;
    if (aberta && Number.isFinite(preco)) {
      valorAtual = p.quantidade * preco;
      naoRealizado = valorAtual - p.custoCentavos;
      total.valorAtualCentavos += valorAtual;
      total.naoRealizadoCentavos += naoRealizado;
      total.custoCentavos += p.custoCentavos;
    } else if (aberta) {
      total.semCotacao += 1;
    }
    total.realizadoCentavos += p.realizadoCentavos;
    total.proventosCentavos += p.proventosCentavos;
    total.investidoCentavos += p.investidoCentavos;
    linhas.push({
      ...p,
      precoCentavos: Number.isFinite(preco) ? preco : null,
      valorAtualCentavos: valorAtual,
      naoRealizadoCentavos: naoRealizado,
      naoRealizadoRazao: naoRealizado !== null && p.custoCentavos > 0 ? naoRealizado / p.custoCentavos : null,
    });
  }
  linhas.sort((a, b) => (b.quantidade > 0) - (a.quantidade > 0) || a.simbolo.localeCompare(b.simbolo));

  total.retornoTotalCentavos = total.naoRealizadoCentavos + total.realizadoCentavos + total.proventosCentavos;
  // Retorno total sobre tudo o que foi comprado (custo das compras). Não é rentabilidade ponderada pelo tempo.
  total.retornoTotalRazao = total.investidoCentavos > 0 ? total.retornoTotalCentavos / total.investidoCentavos : null;
  total.naoRealizadoRazao = total.custoCentavos > 0 ? total.naoRealizadoCentavos / total.custoCentavos : null;
  return { linhas, total };
}
