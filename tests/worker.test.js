import { test } from "node:test";
import assert from "node:assert/strict";
import { criarLimitador, emPregao, obterCotacoes, TETO_MENSAL, ultimoFechamento, validarSimbolos } from "../worker/src/nucleo.js";
import worker from "../worker/src/index.js";

const brt = (dia, h, m = 0) => Date.UTC(2026, 10, dia, h + 3, m); // novembro/2026, horário de Brasília
// 4/11/2026 é quarta; 7 é sábado; 8 domingo; 9 segunda.

const kvFalso = () => {
  const mapa = new Map();
  return { mapa, get: async (k) => mapa.get(k) ?? null, put: async (k, v) => void mapa.set(k, v) };
};
const brapiFalsa = (respostas = {}) => {
  const chamadas = [];
  const f = async (s) => {
    chamadas.push(s);
    return respostas[s] ?? { status: 200, preco: 30.5, horario: "2026-11-04T16:00:00.000Z" };
  };
  f.chamadas = chamadas;
  return f;
};

test("pregão: seg–sex 10h–18h de Brasília", () => {
  assert.equal(emPregao(brt(4, 13)), true);
  assert.equal(emPregao(brt(4, 9, 59)), false);
  assert.equal(emPregao(brt(4, 18)), false);
  assert.equal(emPregao(brt(7, 13)), false);
  assert.equal(emPregao(brt(8, 13)), false);
});

test("último fechamento", () => {
  assert.equal(ultimoFechamento(brt(4, 19)), brt(4, 18));
  assert.equal(ultimoFechamento(brt(4, 11)), brt(3, 18));
  assert.equal(ultimoFechamento(brt(9, 9)), brt(6, 18)); // segunda cedo -> sexta
  assert.equal(ultimoFechamento(brt(8, 12)), brt(6, 18)); // domingo -> sexta
});

test("cache: dentro de 30 min no pregão não busca de novo; depois busca", async () => {
  const kv = kvFalso();
  const brapi = brapiFalsa();
  const a = await obterCotacoes({ simbolos: ["PETR4"], agora: brt(4, 11), kv, buscarBrapi: brapi });
  assert.equal(a.cotacoes.PETR4.precoCentavos, 3050);
  assert.equal(a.cotacoes.PETR4.origem, "atrasado");
  await obterCotacoes({ simbolos: ["PETR4"], agora: brt(4, 11, 20), kv, buscarBrapi: brapi });
  assert.equal(brapi.chamadas.length, 1);
  await obterCotacoes({ simbolos: ["PETR4"], agora: brt(4, 11, 31), kv, buscarBrapi: brapi });
  assert.equal(brapi.chamadas.length, 2);
});

test("fora do pregão: uma busca depois do fechamento serve até o próximo pregão, como fechamento", async () => {
  const kv = kvFalso();
  const brapi = brapiFalsa();
  await obterCotacoes({ simbolos: ["VALE3"], agora: brt(4, 17, 50), kv, buscarBrapi: brapi });
  // 18h30: a busca das 17h50 é anterior ao fechamento: busca de novo e vira "fechamento".
  const b = await obterCotacoes({ simbolos: ["VALE3"], agora: brt(4, 18, 30), kv, buscarBrapi: brapi });
  assert.equal(brapi.chamadas.length, 2);
  assert.equal(b.cotacoes.VALE3.origem, "fechamento");
  // Madrugada e fim de semana: sem novas buscas.
  await obterCotacoes({ simbolos: ["VALE3"], agora: brt(5, 8), kv, buscarBrapi: brapi });
  await obterCotacoes({ simbolos: ["VALE3"], agora: brt(5, 9, 59), kv, buscarBrapi: brapi });
  assert.equal(brapi.chamadas.length, 2);
  // Abriu o pregão e passou de 30 min desde a última busca: busca.
  await obterCotacoes({ simbolos: ["VALE3"], agora: brt(5, 10, 5), kv, buscarBrapi: brapi });
  assert.equal(brapi.chamadas.length, 3);
});

test("no máximo 3 buscas por chamada, uma de cada vez; o resto volta pendente", async () => {
  const kv = kvFalso();
  let simultaneas = 0;
  let maximo = 0;
  const brapi = async () => {
    simultaneas += 1;
    maximo = Math.max(maximo, simultaneas);
    await new Promise((r) => setTimeout(r, 5));
    simultaneas -= 1;
    return { status: 200, preco: 10, horario: "2026-11-04T16:00:00.000Z" };
  };
  const r = await obterCotacoes({ simbolos: ["AAAA3", "BBBB3", "CCCC3", "DDDD3", "EEEE3"], agora: brt(4, 12), kv, buscarBrapi: brapi });
  assert.equal(Object.keys(r.cotacoes).length, 3);
  assert.deepEqual(r.pendentes, ["DDDD3", "EEEE3"]);
  assert.equal(maximo, 1);
});

test("429 da brapi: pausa global, devolve dado velho rotulado e não insiste", async () => {
  const kv = kvFalso();
  const ok = brapiFalsa();
  await obterCotacoes({ simbolos: ["PETR4"], agora: brt(4, 11), kv, buscarBrapi: ok });
  const limitada = brapiFalsa({ PETR4: { status: 429, retryAfter: "120" }, VALE3: { status: 429, retryAfter: "120" } });
  const r = await obterCotacoes({ simbolos: ["PETR4", "VALE3"], agora: brt(4, 12), kv, buscarBrapi: limitada });
  assert.equal(r.cotacoes.PETR4.desatualizado, true);
  assert.deepEqual(r.pendentes, ["VALE3"]);
  assert.equal(limitada.chamadas.length, 1); // a segunda nem foi tentada
  const depois = await obterCotacoes({ simbolos: ["VALE3"], agora: brt(4, 12, 1), kv, buscarBrapi: limitada });
  assert.equal(limitada.chamadas.length, 1); // ainda em pausa
  assert.deepEqual(depois.pendentes, ["VALE3"]);
});

test("ativo inexistente: erro e cache negativo (não gasta cota de novo)", async () => {
  const kv = kvFalso();
  const brapi = brapiFalsa({ ZZZZ9: { status: 404 } });
  const a = await obterCotacoes({ simbolos: ["ZZZZ9"], agora: brt(4, 12), kv, buscarBrapi: brapi });
  assert.equal(a.erros.ZZZZ9, "Ativo não encontrado.");
  const b = await obterCotacoes({ simbolos: ["ZZZZ9"], agora: brt(4, 14), kv, buscarBrapi: brapi });
  assert.equal(b.erros.ZZZZ9, "Ativo não encontrado.");
  assert.equal(brapi.chamadas.length, 1);
});

test("plano não cobre o ativo (403) e falha genérica viram erro por ativo, sem derrubar os outros", async () => {
  const brapi = brapiFalsa({ HGLG11: { status: 403 }, ITUB4: { status: 599 } });
  const r = await obterCotacoes({ simbolos: ["HGLG11", "ITUB4", "PETR4"], agora: brt(4, 12), kv: kvFalso(), buscarBrapi: brapi });
  assert.match(r.erros.HGLG11, /plano gratuito/);
  assert.match(r.erros.ITUB4, /indisponível/);
  assert.ok(r.cotacoes.PETR4);
});

test("preço inválido da brapi não entra no cache", async () => {
  const kv = kvFalso();
  const brapi = brapiFalsa({ PETR4: { status: 200, preco: Number.NaN, horario: "x" } });
  const r = await obterCotacoes({ simbolos: ["PETR4"], agora: brt(4, 12), kv, buscarBrapi: brapi });
  assert.deepEqual(r.cotacoes, {});
  assert.equal(kv.mapa.has("q:PETR4"), false);
});

test("teto mensal: sem cota só serve cache; sem cache, diz que a cota acabou", async () => {
  const kv = kvFalso();
  kv.mapa.set("cota:2026-11", String(TETO_MENSAL));
  const brapi = brapiFalsa();
  const r = await obterCotacoes({ simbolos: ["PETR4"], agora: brt(4, 12), kv, buscarBrapi: brapi });
  assert.match(r.erros.PETR4, /cota mensal/);
  assert.equal(brapi.chamadas.length, 0);
  kv.mapa.set("q:VALE3", JSON.stringify({ precoCentavos: 6000, horario: "2026-11-03T20:00:00.000Z", buscadoEm: brt(3, 12) }));
  const v = await obterCotacoes({ simbolos: ["VALE3"], agora: brt(4, 12), kv, buscarBrapi: brapi });
  assert.equal(v.cotacoes.VALE3.desatualizado, true);
});

test("a contagem de uso sobe a cada busca à brapi", async () => {
  const kv = kvFalso();
  await obterCotacoes({ simbolos: ["PETR4", "VALE3"], agora: brt(4, 12), kv, buscarBrapi: brapiFalsa() });
  assert.equal(kv.mapa.get("cota:2026-11"), "2");
});

test("validação dos símbolos pedidos", () => {
  assert.deepEqual(validarSimbolos("PETR4,HGLG11,PETR4"), ["PETR4", "HGLG11"]);
  for (const ruim of [null, "", "petr4", "PETR", "PETR4,", "<script>", "PETR4;DROP", "A".repeat(300), Array.from({ length: 21 }, (_, i) => `AAA${String.fromCharCode(65 + i)}3`).join(",")]) {
    assert.equal(validarSimbolos(ruim), null, String(ruim).slice(0, 30));
  }
});

test("limitador por visitante", () => {
  const ok = criarLimitador(3, 1000);
  assert.deepEqual([1, 2, 3, 4].map(() => ok("ip", 0)), [true, true, true, false]);
  assert.equal(ok("outro", 0), true);
  assert.equal(ok("ip", 1500), true); // janela nova
});

test("HTTP: CORS só para a origem permitida, validação, método e saúde", async () => {
  const env = { ORIGENS_PERMITIDAS: "https://islan-max.github.io", BRAPI_TOKEN: "t", COTACOES: kvFalso() };
  const req = (url, init = {}) => new Request(`https://w.example${url}`, init);
  const ok = await worker.fetch(req("/saude", { headers: { origin: "https://islan-max.github.io" } }), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://islan-max.github.io");
  const estranho = await worker.fetch(req("/saude", { headers: { origin: "https://evil.example" } }), env);
  assert.equal(estranho.headers.get("access-control-allow-origin"), null);
  assert.equal((await worker.fetch(req("/cotacoes?s=petr4"), env)).status, 400);
  assert.equal((await worker.fetch(req("/cotacoes"), env)).status, 400);
  assert.equal((await worker.fetch(req("/cotacoes?s=PETR4", { method: "POST" }), env)).status, 405);
  assert.equal((await worker.fetch(req("/outra"), env)).status, 404);
  assert.equal((await worker.fetch(req("/cotacoes?s=PETR4"), { ...env, BRAPI_TOKEN: undefined })).status, 503);
  assert.equal((await worker.fetch(req("/cotacoes", { method: "OPTIONS", headers: { origin: "https://islan-max.github.io" } }), env)).status, 204);
});

test("HTTP: busca na brapi com Bearer, converte para centavos e não repassa o token", async () => {
  const original = globalThis.fetch;
  const vistos = [];
  globalThis.fetch = async (url, init) => {
    vistos.push({ url: String(url), auth: init.headers.authorization });
    return new Response(JSON.stringify({ results: [{ regularMarketPrice: 38.05, regularMarketTime: "2026-11-04T16:00:00.000Z" }] }), { status: 200 });
  };
  try {
    const env = { ORIGENS_PERMITIDAS: "", BRAPI_TOKEN: "SEGREDO", COTACOES: kvFalso() };
    const r = await worker.fetch(new Request("https://w.example/cotacoes?s=PETR4"), env);
    const corpo = await r.text();
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(corpo).cotacoes.PETR4.precoCentavos, 3805);
    assert.equal(vistos[0].url, "https://brapi.dev/api/quote/PETR4");
    assert.equal(vistos[0].auth, "Bearer SEGREDO");
    assert.equal(corpo.includes("SEGREDO"), false);
    assert.equal(r.headers.get("cache-control"), "public, max-age=30");
  } finally {
    globalThis.fetch = original;
  }
});
