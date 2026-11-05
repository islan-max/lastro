import { test } from "node:test";
import assert from "node:assert/strict";
import { calcular, resumir, validarLancamento } from "../site/js/carteira.js";

let n = 0;
const compra = (simbolo, data, quantidade, precoCentavos, taxasCentavos = 0) => ({ id: `l${++n}`, tipo: "compra", simbolo, data, quantidade, precoCentavos, taxasCentavos });
const venda = (simbolo, data, quantidade, precoCentavos, taxasCentavos = 0) => ({ id: `l${++n}`, tipo: "venda", simbolo, data, quantidade, precoCentavos, taxasCentavos });
const provento = (simbolo, data, valorCentavos, subtipo = "dividendo") => ({ id: `l${++n}`, tipo: "provento", simbolo, data, valorCentavos, subtipo });

test("preço médio ponderado com taxas no custo", () => {
  const { posicoes } = calcular([compra("PETR4", "2026-01-02", 100, 3000, 100), compra("PETR4", "2026-02-02", 100, 3400, 100)]);
  const p = posicoes.PETR4;
  assert.equal(p.quantidade, 200);
  assert.equal(p.custoCentavos, 100 * 3000 + 100 + 100 * 3400 + 100);
  assert.equal(p.precoMedioCentavos, 3201); // 640_200 / 200
});

test("venda parcial realiza resultado pelo preço médio e mantém o médio", () => {
  const { posicoes, erros } = calcular([compra("VALE3", "2026-01-02", 100, 6000), venda("VALE3", "2026-03-01", 40, 7000, 50)]);
  const p = posicoes.VALE3;
  assert.deepEqual(erros, []);
  assert.equal(p.quantidade, 60);
  assert.equal(p.custoCentavos, 360000); // 60 * 6000
  assert.equal(p.realizadoCentavos, 40 * 7000 - 50 - 40 * 6000); // 39_950
});

test("venda total zera a posição sem resíduo de arredondamento", () => {
  const { posicoes } = calcular([compra("HGLG11", "2026-01-02", 3, 15033), compra("HGLG11", "2026-01-03", 4, 15099), venda("HGLG11", "2026-02-01", 7, 16000)]);
  const p = posicoes.HGLG11;
  assert.equal(p.quantidade, 0);
  assert.equal(p.custoCentavos, 0);
  assert.equal(p.precoMedioCentavos, null);
  assert.equal(p.realizadoCentavos, 7 * 16000 - (3 * 15033 + 4 * 15099));
});

test("venda maior que a posição é recusada e não altera nada", () => {
  const v = venda("ITUB4", "2026-02-01", 20, 3000);
  const { posicoes, erros } = calcular([compra("ITUB4", "2026-01-02", 10, 2800), v]);
  assert.equal(posicoes.ITUB4.quantidade, 10);
  assert.equal(posicoes.ITUB4.realizadoCentavos, 0);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].id, v.id);
});

test("a ordem de lançamento não importa: vale a data (compra antes de venda no mesmo dia)", () => {
  const { posicoes, erros } = calcular([venda("BBAS3", "2026-02-01", 10, 3000), compra("BBAS3", "2026-02-01", 10, 2800)]);
  assert.deepEqual(erros, []);
  assert.equal(posicoes.BBAS3.quantidade, 0);
  assert.equal(posicoes.BBAS3.realizadoCentavos, 2000);
});

test("venda antes da compra (por data) é recusada", () => {
  const { erros } = calcular([compra("BBAS3", "2026-03-01", 10, 2800), venda("BBAS3", "2026-02-01", 10, 3000)]);
  assert.equal(erros.length, 1);
});

test("proventos somam por ativo", () => {
  const { posicoes } = calcular([compra("MXRF11", "2026-01-02", 100, 1000), provento("MXRF11", "2026-02-10", 1000, "rendimento"), provento("MXRF11", "2026-03-10", 1100, "rendimento")]);
  assert.equal(posicoes.MXRF11.proventosCentavos, 2100);
});

test("resumo: não realizado, retorno total e ativo sem cotação", () => {
  const { posicoes } = calcular([
    compra("PETR4", "2026-01-02", 100, 3000),
    compra("VALE3", "2026-01-02", 10, 6000),
    compra("XPTO3", "2026-01-02", 5, 1000),
    venda("PETR4", "2026-02-01", 50, 3500),
    provento("PETR4", "2026-02-15", 5000, "jcp"),
  ]);
  const { linhas, total } = resumir(posicoes, { PETR4: 3600, VALE3: 5000 });
  const petr = linhas.find((l) => l.simbolo === "PETR4");
  assert.equal(petr.valorAtualCentavos, 50 * 3600);
  assert.equal(petr.naoRealizadoCentavos, 50 * 3600 - 50 * 3000);
  assert.ok(Math.abs(petr.naoRealizadoRazao - 0.2) < 1e-12);
  assert.equal(linhas.find((l) => l.simbolo === "XPTO3").valorAtualCentavos, null);
  assert.equal(total.semCotacao, 1);
  assert.equal(total.realizadoCentavos, 50 * 500);
  assert.equal(total.proventosCentavos, 5000);
  assert.equal(total.naoRealizadoCentavos, 30000 + (10 * 5000 - 10 * 6000));
  assert.equal(total.retornoTotalCentavos, total.naoRealizadoCentavos + 25000 + 5000);
  assert.equal(total.investidoCentavos, 300000 + 60000 + 5000);
});

test("carteira vazia: razões nulas, sem NaN", () => {
  const { total } = resumir(calcular([]).posicoes, {});
  assert.equal(total.retornoTotalRazao, null);
  assert.equal(total.naoRealizadoRazao, null);
});

test("validação de lançamentos", () => {
  const ok = compra("PETR4", "2026-01-02", 1, 100);
  assert.deepEqual(validarLancamento(ok), []);
  assert.ok(validarLancamento({ ...ok, quantidade: 1.5 }).length);
  assert.ok(validarLancamento({ ...ok, quantidade: 0 }).length);
  assert.ok(validarLancamento({ ...ok, precoCentavos: -1 }).length);
  assert.ok(validarLancamento({ ...ok, simbolo: "petr4" }).length);
  assert.ok(validarLancamento({ ...ok, simbolo: "<img>" }).length);
  assert.ok(validarLancamento({ ...ok, data: "2026-02-30" }).length);
  assert.ok(validarLancamento({ ...ok, data: "02/01/2026" }).length);
  assert.ok(validarLancamento({ ...ok, tipo: "troca" }).length);
  assert.ok(validarLancamento({ ...provento("PETR4", "2026-01-02", 100), subtipo: "x" }).length);
  assert.ok(validarLancamento(null).length);
});
