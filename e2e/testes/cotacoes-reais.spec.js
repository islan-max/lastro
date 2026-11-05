import { test, expect, axe } from "./ajuda.js";

// O Worker real ainda não é o alvo destes testes: o endereço é simulado com page.route e a página recebe
// o <meta lastro-worker> e a CSP ajustados em tempo de execução (o arquivo publicado não muda).
const WORKER = "https://worker.exemplo.test";
const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" };

async function comWorker(page, responder) {
  await page.route(/\/lastro\/(index\.html)?$/, async (route) => {
    const r = await route.fetch();
    const html = (await r.text())
      .replace(/name="lastro-worker" content="[^"]*"/, `name="lastro-worker" content="${WORKER}"`)
      .replace(/connect-src 'self'[^;"]*/, `connect-src 'self' ${WORKER}`);
    await route.fulfill({ response: r, body: html, headers: { ...r.headers(), "content-length": String(Buffer.byteLength(html)) } });
  });
  const pedidos = [];
  await page.route(`${WORKER}/**`, async (route) => {
    pedidos.push(route.request().url());
    const { status = 200, corpo } = (await responder(new URL(route.request().url()), pedidos.length)) ?? {};
    await route.fulfill({ status, headers: CORS, body: JSON.stringify(corpo ?? {}) });
  });
  return pedidos;
}

const cot = (precoCentavos, origem = "atrasado", extra = {}) => ({ precoCentavos, horario: "2026-11-04T16:00:00.000Z", origem, ...extra });

test("preços reais aparecem com origem e horário; só símbolos vão ao servidor", async ({ page }) => {
  const pedidos = await comWorker(page, () => ({ corpo: { cotacoes: { PETR4: cot(3805), VALE3: cot(6100, "fechamento") }, erros: {}, pendentes: [] } }));
  await page.goto("./");
  await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
  const linha = page.locator("#tabela-posicoes tbody tr", { hasText: "PETR4" });
  await expect(linha).toContainText("R$ 38,05");
  await expect(linha).toContainText("atrasada ~30 min, 13:00");
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "VALE3" })).toContainText("fechamento de 04/11/2026");
  await expect(page.locator("#aviso-fonte")).toContainText("brapi");
  await expect(page.getByRole("button", { name: /Preços:/ })).toContainText("atrasados (reais)");
  const urls = pedidos.map((u) => new URL(u));
  expect(urls.length).toBeGreaterThan(0);
  for (const u of urls) {
    expect(u.pathname).toBe("/cotacoes");
    expect([...u.searchParams.keys()]).toEqual(["s"]);
    expect(u.searchParams.get("s")).toMatch(/^[A-Z0-9]+(,[A-Z0-9]+)*$/);
    expect(u.href).not.toMatch(/\d{4}-\d{2}-\d{2}|quantidade|preco/i);
  }
});

test("ativos pendentes são pedidos de novo, sem travar a tela", async ({ page }) => {
  const pedidos = await comWorker(page, (_u, n) => (n === 1 ? { corpo: { cotacoes: { PETR4: cot(3805) }, erros: {}, pendentes: ["VALE3"] } } : { corpo: { cotacoes: { PETR4: cot(3805), VALE3: cot(6100) }, erros: {}, pendentes: [] } }));
  await page.goto("./");
  await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "VALE3" })).toContainText("buscando o preço");
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "VALE3" })).toContainText("R$ 61,00", { timeout: 12_000 });
  expect(pedidos.length).toBeGreaterThanOrEqual(2);
});

test("erro por ativo e dado desatualizado são mostrados, o resto continua", async ({ page }) => {
  await comWorker(page, () => ({ corpo: { cotacoes: { PETR4: cot(3805, "atrasado", { desatualizado: true }) }, erros: { HGLG11: "Este ativo não está disponível no plano gratuito do serviço de cotações." }, pendentes: [] } }));
  await page.goto("./");
  await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "PETR4" })).toContainText("desatualizada");
  await expect(page.locator("#fonte-erro")).toContainText("HGLG11");
});

test("servidor fora do ar: mensagem clara e opção de usar a demonstração", async ({ page }) => {
  await comWorker(page, () => ({ status: 503, corpo: { erro: "x" } }));
  await page.goto("./");
  await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
  await expect(page.locator("#fonte-erro")).toContainText("respondeu 503");
  await expect(page.locator("#fonte-erro")).toContainText("demonstração");
  await page.getByRole("button", { name: /Preços:/ }).click();
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "PETR4" })).toContainText("simulado");
  await expect(page.locator("#aviso-fonte")).toContainText("simulados");
});

test("resposta malformada é ignorada (preço negativo, origem desconhecida, símbolo estranho)", async ({ page }) => {
  await comWorker(page, () => ({ corpo: { cotacoes: { PETR4: cot(-5), VALE3: cot(100, "inventada"), "<b>x</b>": cot(100), HGLG11: cot(15000) }, erros: {}, pendentes: [] } }));
  await page.goto("./");
  await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "HGLG11" })).toContainText("R$ 150,00");
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "PETR4" })).toContainText("sem preço");
  expect(await page.locator("b").count()).toBe(0);
});

test("trocar de fonte não mistura preço simulado com preço real", async ({ page }) => {
  await comWorker(page, () => ({ corpo: { cotacoes: { PETR4: cot(3805) }, erros: {}, pendentes: [] } }));
  await page.goto("./");
  await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "PETR4" })).toContainText("atrasada");
  await page.getByRole("button", { name: /Preços:/ }).click();
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "PETR4" })).not.toContainText("atrasada");
  await page.reload();
  await expect(page.getByRole("button", { name: /Preços:/ })).toContainText("demonstração"); // a escolha persiste
});

for (const tema of ["claro", "escuro"]) {
  test.describe(`axe com fonte real, tema ${tema}`, () => {
    test.use({ tema });
    test("sem violações", async ({ page }) => {
      await comWorker(page, () => ({ corpo: { cotacoes: { PETR4: cot(3805), VALE3: cot(6100, "fechamento"), HGLG11: cot(15000, "atrasado", { desatualizado: true }) }, erros: { MXRF11: "Ativo não encontrado." }, pendentes: [] } }));
      await page.goto("./");
      await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
      await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "PETR4" })).toContainText("R$ 38,05");
      expect(await axe(page)).toEqual([]);
    });
  });
}
