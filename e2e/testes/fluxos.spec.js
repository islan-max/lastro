import { readFile } from "node:fs/promises";
import { test, expect, lancarCompra } from "./ajuda.js";

test("compra aparece na posição com preço médio e taxas", async ({ page }) => {
  await page.goto("./");
  await lancarCompra(page, { quantidade: "100", preco: "30,00", taxas: "10,00" });
  await expect(page.locator("#status")).toContainText("Compra de 100 PETR4 adicionado");
  const linha = page.locator("#tabela-posicoes tbody tr", { hasText: "PETR4" });
  await expect(linha).toContainText("R$ 30,10"); // (3000 + 10) / 100
  await expect(page.locator("#tabela-lancamentos tbody tr")).toHaveCount(1);
  // Foco volta ao campo Ativo para o próximo lançamento.
  await expect(page.getByLabel("Ativo").first()).toBeFocused();
});

test("venda maior que a posição é recusada com mensagem", async ({ page }) => {
  await page.goto("./");
  await lancarCompra(page, { quantidade: "10" });
  await page.getByLabel("Tipo", { exact: true }).selectOption("venda");
  await page.getByLabel("Ativo").first().fill("PETR4");
  await page.getByLabel("Data").fill("2026-02-01");
  await page.getByLabel("Quantidade").fill("20");
  await page.getByLabel("Preço por unidade (R$)").fill("31,00");
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await expect(page.locator("#e-form")).toContainText("não tinha 20");
  await expect(page.locator("#tabela-lancamentos tbody tr")).toHaveCount(1);
});

test("validação: campos inválidos recebem erro e aria-invalid", async ({ page }) => {
  await page.goto("./");
  await page.getByLabel("Ativo").first().fill("petr");
  await page.getByLabel("Quantidade").fill("1,5");
  await page.getByLabel("Preço por unidade (R$)").fill("abc");
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  for (const id of ["f-simbolo", "f-quantidade", "f-preco"]) await expect(page.locator(`#${id}`)).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#f-simbolo")).toBeFocused();
  await expect(page.locator("#f-simbolo")).toHaveAttribute("aria-describedby", /e-simbolo/);
  await expect(page.locator("#tabela-lancamentos")).toBeHidden();
});

test("símbolo digitado em minúsculas é normalizado; data futura é recusada", async ({ page }) => {
  await page.goto("./");
  await lancarCompra(page, { simbolo: "vale3", data: "2999-01-01" });
  await expect(page.locator("#e-data")).toContainText("futura");
  await page.getByLabel("Data").fill("2026-01-05");
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "VALE3" })).toHaveCount(1);
});

test("provento soma nos totais", async ({ page }) => {
  await page.goto("./");
  await lancarCompra(page, { simbolo: "MXRF11", quantidade: "100", preco: "10,00" });
  await page.getByLabel("Tipo", { exact: true }).selectOption("provento");
  await page.getByLabel("Ativo").first().fill("MXRF11");
  await page.getByLabel("Data").fill("2026-02-10");
  await page.getByLabel("Valor recebido (R$)").fill("12,34");
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await expect(page.locator("#resumo")).toContainText("Proventos recebidosR$ 12,34");
});

test("excluir lançamento pede confirmação e Cancelar mantém", async ({ page }) => {
  await page.goto("./");
  await lancarCompra(page);
  await page.getByRole("button", { name: /Excluir compra de PETR4/ }).click();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.locator("#tabela-lancamentos tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: /Excluir compra de PETR4/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.locator("#tabela-lancamentos")).toBeHidden();
  await expect(page.locator("#sem-lancamentos")).toBeVisible();
});

test("dados persistem ao recarregar", async ({ page }) => {
  await page.goto("./");
  await lancarCompra(page);
  await page.reload();
  await expect(page.locator("#tabela-lancamentos tbody tr")).toHaveCount(1);
});

test("alerta dispara uma vez, avisa na página, notifica e pode ser rearmado", async ({ page }) => {
  await page.goto("./");
  await page.getByLabel("Ativo").nth(1).fill("PETR4");
  await page.getByLabel("Preço (R$)").fill("0,01");
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await expect(page.locator("#lista-alertas .etiqueta")).toContainText("disparado em");
  await expect(page.locator("#status")).toContainText("PETR4 ficou igual ou acima de R$ 0,01");
  const n = await page.evaluate(() => window.__notificacoes);
  expect(n).toHaveLength(1);
  expect(n[0].body).toMatch(/simulado/);
  // Não dispara de novo sozinho.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__notificacoes.length)).toBe(1);
  // Rearmar dispara de novo (o preço continua acima do limite).
  await page.getByRole("button", { name: /Rearmar alerta/ }).click();
  await expect.poll(() => page.evaluate(() => window.__notificacoes.length)).toBe(2);
});

test("alerta abaixo do preço atual fica armado", async ({ page }) => {
  await page.goto("./");
  await page.getByLabel("Ativo").nth(1).fill("PETR4");
  await page.getByLabel("Avisar quando o preço ficar").selectOption("abaixo");
  await page.getByLabel("Preço (R$)").fill("0,01");
  await page.getByRole("button", { name: "Criar alerta" }).click();
  await expect(page.locator("#lista-alertas li").first()).toContainText("último preço");
  await expect(page.locator("#lista-alertas .etiqueta")).toHaveCount(0);
});

test("ativo sem cobertura na demonstração aparece como sem preço, sem derrubar o resto", async ({ page }) => {
  await page.goto("./");
  await lancarCompra(page, { simbolo: "CSAN3" });
  await lancarCompra(page, { simbolo: "PETR4" });
  await expect(page.locator("#fonte-erro")).toContainText("CSAN3");
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "CSAN3" })).toContainText("sem preço");
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "PETR4" })).toContainText("simulado");
});

test("exportar JSON e CSV; importar válido substitui; inválido é recusado", async ({ page }, info) => {
  await page.goto("./");
  await lancarCompra(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar tudo (JSON)" }).click()]);
  const caminho = info.outputPath("backup.json");
  await dl.saveAs(caminho);
  const json = JSON.parse(await readFile(caminho, "utf8"));
  expect(json.versao).toBe(1);
  expect(json.lancamentos).toHaveLength(1);
  await expect(page.locator("#backup-estado")).toContainText("Último backup exportado em");

  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar lançamentos (CSV)" }).click()]);
  await csv.saveAs(info.outputPath("l.csv"));
  expect(await readFile(info.outputPath("l.csv"), "utf8")).toContain("2026-01-05;compra;PETR4;100;30,00;0,00");

  await page.getByRole("button", { name: "Apagar tudo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apagar tudo" }).click();
  await expect(page.locator("#sem-lancamentos")).toBeVisible();

  await page.setInputFiles("#importar-json", caminho);
  await page.getByRole("dialog").getByRole("button", { name: "Substituir" }).click();
  await expect(page.locator("#tabela-lancamentos tbody tr")).toHaveCount(1);

  await page.setInputFiles("#importar-json", { name: "ruim.json", mimeType: "application/json", buffer: Buffer.from('{"versao":1,"lancamentos":[{"id":"x","tipo":"compra","simbolo":"<img src=x>","data":"2026-01-01","quantidade":1,"precoCentavos":1,"taxasCentavos":0}],"alertas":[]}') });
  await expect(page.locator("#fonte-erro")).toContainText("Símbolo inválido");
  await expect(page.locator("#tabela-lancamentos tbody tr")).toHaveCount(1); // nada foi substituído
});

test("tema alterna, persiste e respeita o sistema por padrão", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(245, 246, 240)");
  const botao = page.getByRole("button", { name: /Tema:/ });
  await botao.click(); // claro
  await botao.click(); // escuro
  await expect(page.locator("html")).toHaveAttribute("data-theme", "escuro");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "escuro");
});

test("avisos obrigatórios sempre visíveis", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("region", { name: "Avisos importantes" })).toContainText("Não é recomendação de investimento");
  await expect(page.getByRole("region", { name: "Avisos importantes" })).toContainText("Preços com atraso");
  await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
  await expect(page.getByRole("region", { name: "Avisos importantes" })).toBeVisible();
});

test("privacidade: sem cookies e sem requisições para outros endereços", async ({ page, context }) => {
  const externas = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://localhost") && !r.url().startsWith(new URL("./", page.url() || "http://localhost").origin) && !r.url().startsWith("data:")) externas.push(r.url());
  });
  await page.goto("./");
  await lancarCompra(page);
  await page.waitForTimeout(500);
  expect(await context.cookies()).toEqual([]);
  expect(externas.filter((u) => !u.startsWith("about:"))).toEqual([]);
});

test("XSS: texto malicioso no símbolo é recusado e nada vira HTML", async ({ page }) => {
  await page.goto("./");
  await lancarCompra(page, { simbolo: "<img src=x onerror=alert(1)>" });
  await expect(page.locator("#e-simbolo")).toBeVisible();
  expect(await page.locator("img").count()).toBe(0);
});
