// Modo demonstração: preços SIMULADOS, determinísticos por (símbolo, tick). Funciona sem rede.
// Porte do provedor simulado do laboratório (dados-e-mercado/watchlist): o preço no tick n só
// depende do símbolo e de n, então todo mundo vê o mesmo preço no mesmo instante.
// Os símbolos e nomes são de ativos reais da B3 só para a busca fazer sentido; os preços-base
// são FICTÍCIOS. Isto é uma animação com cara de mercado, não um modelo de mercado nem uma cotação.

export const INTERVALO_TICK_MS = 15_000;
const INICIO = Date.UTC(2026, 0, 1);

// Ativo sem cobertura de propósito (coberto: false) exercita o caminho de erro na interface.
export const CATALOGO = [
  ["PETR4", "Petrobras PN", 3800], ["VALE3", "Vale ON", 6200], ["ITUB4", "Itaú Unibanco PN", 3300],
  ["BBDC4", "Bradesco PN", 1400], ["BBAS3", "Banco do Brasil ON", 2700], ["ABEV3", "Ambev ON", 1200],
  ["WEGE3", "WEG ON", 4500], ["RENT3", "Localiza ON", 5100], ["SUZB3", "Suzano ON", 5400],
  ["LREN3", "Lojas Renner ON", 1800], ["RADL3", "Raia Drogasil ON", 2400], ["B3SA3", "B3 ON", 1100],
  ["ITSA4", "Itaúsa PN", 1000], ["GGBR4", "Gerdau PN", 2000], ["JBSS3", "JBS ON", 3100],
  ["ELET3", "Eletrobras ON", 4000], ["EQTL3", "Equatorial ON", 3200], ["SBSP3", "Sabesp ON", 12000],
  ["RAIL3", "Rumo ON", 2000], ["PRIO3", "PetroRio ON", 4300], ["VIVT3", "Vivo ON", 3000],
  ["TOTS3", "Totvs ON", 3400], ["MGLU3", "Magazine Luiza ON", 900], ["CPLE6", "Copel PNB", 700],
  ["HGLG11", "CSHG Logística (FII)", 15800], ["MXRF11", "Maxi Renda (FII)", 1000],
  ["KNRI11", "Kinea Renda Imobiliária (FII)", 14000], ["XPLG11", "XP Log (FII)", 10000],
  ["VISC11", "Vinci Shopping Centers (FII)", 11000], ["BOVA11", "iShares Ibovespa (ETF)", 13000],
  ["CSAN3", "Cosan ON (sem cobertura na demo)", 1500, false],
].map(([simbolo, nome, baseCentavos, coberto = true]) => ({ simbolo, nome, baseCentavos, coberto }));

const POR_SIMBOLO = new Map(CATALOGO.map((a) => [a.simbolo, a]));

// (período em ticks, amplitude do log-preço): do tremor curto à tendência lenta.
const ESCALAS = [[1, 0.0015], [4, 0.003], [13, 0.006], [61, 0.012], [307, 0.025], [1511, 0.05], [7001, 0.06]];

function hash32(texto) {
  // FNV-1a 32 bits + mistura final: suficiente para ruído visual, nada de segurança.
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const ruido = (simbolo, periodo, i) => hash32(`2026:${simbolo}:${periodo}:${i}`) / 2 ** 31 - 1; // [-1, 1)

function logPreco(simbolo, tick) {
  let total = 0;
  for (const [periodo, amplitude] of ESCALAS) {
    const i = Math.floor(tick / periodo);
    const t = (1 - Math.cos((Math.PI * (tick % periodo)) / periodo)) / 2;
    const a = ruido(simbolo, periodo, i);
    const b = ruido(simbolo, periodo, i + 1);
    total += amplitude * (a + (b - a) * t);
  }
  return total;
}

export const tickEm = (agoraMs) => Math.max(0, Math.floor((agoraMs - INICIO) / INTERVALO_TICK_MS));

export function buscar(consulta, limite = 8) {
  const q = consulta.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  if (!q) return [];
  const sem = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return CATALOGO.filter((a) => a.simbolo.toLowerCase().includes(q) || sem(a.nome).includes(q))
    .sort((a, b) => Number(!a.simbolo.toLowerCase().startsWith(q)) - Number(!b.simbolo.toLowerCase().startsWith(q)) || a.simbolo.localeCompare(b.simbolo))
    .slice(0, limite);
}

/** Fonte de preços da demonstração. Mesmo contrato da fonte real: { cotacoes, erros }. */
export const fonteDemo = {
  id: "demo",
  rotulo: "Demonstração (preços simulados)",
  intervaloMs: INTERVALO_TICK_MS,
  async buscar(simbolos, agoraMs = Date.now()) {
    const tick = tickEm(agoraMs);
    const horario = new Date(INICIO + tick * INTERVALO_TICK_MS).toISOString();
    const cotacoes = {};
    const erros = {};
    for (const s of simbolos) {
      const a = POR_SIMBOLO.get(s);
      if (!a || !a.coberto) {
        erros[s] = "A demonstração não cobre este ativo.";
        continue;
      }
      cotacoes[s] = { precoCentavos: Math.max(1, Math.round(a.baseCentavos * Math.exp(logPreco(s, tick)))), horario, origem: "simulado" };
    }
    return { cotacoes, erros };
  },
};

/** Carteira de exemplo (dados fictícios). Ids estáveis para os testes. */
export function carteiraExemplo() {
  const c = (n, simbolo, data, quantidade, precoCentavos, taxasCentavos = 0) => ({ id: `ex${n}`, tipo: "compra", simbolo, data, quantidade, precoCentavos, taxasCentavos });
  return [
    c(1, "PETR4", "2026-02-10", 200, 3600, 150),
    c(2, "PETR4", "2026-05-12", 100, 3950, 100),
    c(3, "VALE3", "2026-03-03", 100, 6000, 120),
    { id: "ex4", tipo: "venda", simbolo: "VALE3", data: "2026-08-20", quantidade: 40, precoCentavos: 6500, taxasCentavos: 100 },
    c(5, "HGLG11", "2026-04-07", 20, 15500, 0),
    c(6, "MXRF11", "2026-04-07", 300, 980, 0),
    { id: "ex7", tipo: "provento", simbolo: "MXRF11", data: "2026-06-14", valorCentavos: 2700, subtipo: "rendimento" },
    { id: "ex8", tipo: "provento", simbolo: "PETR4", data: "2026-08-29", valorCentavos: 4100, subtipo: "jcp" },
  ];
}
