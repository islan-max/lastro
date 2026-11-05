import { test, expect, axe, lancarCompra } from "./ajuda.js";

for (const tema of ["claro", "escuro"]) {
  test.describe(`axe, tema ${tema}`, () => {
    test.use({ tema });

    test("carteira vazia", async ({ page }) => {
      await page.goto("./");
      await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
      expect(await axe(page)).toEqual([]);
    });

    test("carteira de exemplo com preços", async ({ page }) => {
      await page.goto("./");
      await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
      await expect(page.locator("#tabela-posicoes tbody tr")).toHaveCount(4);
      expect(await axe(page)).toEqual([]);
    });

    test("erros de formulário (lançamento e alerta)", async ({ page }) => {
      await page.goto("./");
      await page.getByRole("button", { name: "Adicionar lançamento" }).click();
      await expect(page.locator("#e-simbolo")).toBeVisible();
      await page.getByRole("button", { name: "Criar alerta" }).click();
      await expect(page.locator("#ea-simbolo")).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test("tipo provento", async ({ page }) => {
      await page.goto("./");
      await page.getByLabel("Tipo", { exact: true }).selectOption("provento");
      await expect(page.getByLabel("Valor recebido (R$)")).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test("diálogo de confirmação aberto", async ({ page }) => {
      await page.goto("./");
      await lancarCompra(page);
      await page.getByRole("button", { name: /Excluir compra de PETR4/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test("alerta disparado e lista de alertas", async ({ page }) => {
      await page.goto("./");
      await page.getByLabel("Ativo").nth(1).fill("PETR4");
      await page.getByLabel("Preço (R$)").fill("0,01");
      await page.getByRole("button", { name: "Criar alerta" }).click();
      await expect(page.locator("#lista-alertas .etiqueta")).toContainText("disparado");
      expect(await axe(page)).toEqual([]);
    });

    test("privacidade e 404", async ({ page }) => {
      await page.goto("privacidade.html");
      expect(await axe(page)).toEqual([]);
      const r = await page.goto("nao-existe");
      expect(r.status()).toBe(404);
      expect(await axe(page)).toEqual([]);
    });
  });
}
