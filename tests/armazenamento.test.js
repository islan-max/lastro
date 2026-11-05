import { test } from "node:test";
import assert from "node:assert/strict";
import { lerJson, paraJson, paraCsv, vazio, carregar, salvar } from "../site/js/armazenamento.js";
import { reaisParaCentavos, formatarReais } from "../site/js/moeda.js";
import { alertasCruzados, validarAlerta } from "../site/js/alertas.js";

const compra = { id: "a", tipo: "compra", simbolo: "PETR4", data: "2026-01-02", quantidade: 10, precoCentavos: 3050, taxasCentavos: 100 };
const dados = { ...vazio(), lancamentos: [compra], alertas: [{ id: "x", simbolo: "PETR4", direcao: "acima", precoCentavos: 4000, disparadoEm: null }] };

test("JSON: ida e volta preserva os dados", () => {
  const r = lerJson(paraJson(dados));
  assert.deepEqual(r.dados, dados);
});

test("JSON: entradas inválidas são recusadas com mensagem", () => {
  for (const ruim of ["", "{", "[]", "null", '{"versao":2,"lancamentos":[],"alertas":[]}', '{"versao":1,"lancamentos":{}, "alertas":[]}']) {
    assert.ok(lerJson(ruim).erro, ruim);
  }
  const semSimbolo = { ...dados, lancamentos: [{ ...compra, simbolo: "<script>" }] };
  assert.match(lerJson(JSON.stringify(semSimbolo)).erro, /Símbolo/);
  const repetido = { ...dados, lancamentos: [compra, compra] };
  assert.match(lerJson(JSON.stringify(repetido)).erro, /repetido/);
});

test("JSON: campos desconhecidos não entram no estado (mass assignment)", () => {
  const sujo = { ...dados, lancamentos: [{ ...compra, admin: true, __proto__: { x: 1 } }], extra: 1 };
  const r = lerJson(JSON.stringify(sujo));
  assert.deepEqual(Object.keys(r.dados.lancamentos[0]).sort(), ["data", "id", "precoCentavos", "quantidade", "simbolo", "taxasCentavos", "tipo"]);
  assert.equal("extra" in r.dados, false);
});

test("CSV neutraliza fórmulas e formata reais", () => {
  const csv = paraCsv([{ ...compra }, { id: "p", tipo: "provento", simbolo: "MXRF11", data: "2026-02-01", valorCentavos: 1234, subtipo: "rendimento" }]);
  const linhas = csv.split("\r\n");
  assert.equal(linhas[0], "data;tipo;simbolo;quantidade;preco;taxas;valor;subtipo");
  assert.equal(linhas[1], "2026-01-02;compra;PETR4;10;30,50;1,00;;");
  assert.equal(linhas[2], "2026-02-01;provento;MXRF11;;;;12,34;rendimento");
  assert.match(paraCsv([{ ...compra, simbolo: "=1+1" }]), /'=1\+1/);
});

test("armazenamento: carregar tolera lixo e salvar tolera cota cheia", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(carregar(storage), vazio());
  assert.equal(salvar(dados, storage), true);
  assert.deepEqual(carregar(storage), dados);
  mem.set("lastro:v1", "lixo");
  assert.deepEqual(carregar(storage), vazio());
  assert.equal(salvar(dados, { setItem() { throw new Error("QuotaExceededError"); } }), false);
});

test("moeda: converte texto em centavos", () => {
  assert.equal(reaisParaCentavos("1.234,56"), 123456);
  assert.equal(reaisParaCentavos("30,5"), 3050);
  assert.equal(reaisParaCentavos("12"), 1200);
  assert.equal(reaisParaCentavos("R$ 0,99"), 99);
  for (const ruim of ["", "abc", "1,234", "-5", "1e3", "1.2.3", "12,345", null, "99999999999999999999"]) assert.equal(reaisParaCentavos(ruim), null, String(ruim));
  assert.match(formatarReais(123456).replace(/\s/g, " "), /R\$ 1\.234,56/);
});

test("alertas: cruzamento acima/abaixo, uma vez só, sem cotação não dispara", () => {
  const a = (id, simbolo, direcao, precoCentavos, disparadoEm = null) => ({ id, simbolo, direcao, precoCentavos, disparadoEm });
  const alertas = [a("1", "PETR4", "acima", 4000), a("2", "PETR4", "abaixo", 3000), a("3", "VALE3", "acima", 100), a("4", "ITUB4", "abaixo", 5000, "2026-11-01T10:00:00Z")];
  const ids = alertasCruzados(alertas, { PETR4: 4000, ITUB4: 100 }).map((x) => x.id);
  assert.deepEqual(ids, ["1"]);
  assert.deepEqual(alertasCruzados(alertas, { PETR4: 3000 }).map((x) => x.id), ["2"]);
  assert.ok(validarAlerta(a("5", "PETR4", "igual", 10)).length);
  assert.ok(validarAlerta(a("5", "PETR4", "acima", 0)).length);
});
