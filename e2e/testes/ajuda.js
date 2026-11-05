import { test as base, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export { expect };

// Cada teste começa com navegador limpo; `tema` ("claro" | "escuro") é aplicado antes da página carregar.
export const test = base.extend({
  tema: [undefined, { option: true }],
  page: async ({ page, tema }, use) => {
    await page.addInitScript((t) => {
      if (t && !sessionStorage.getItem("lastro-e2e")) {
        sessionStorage.setItem("lastro-e2e", "1");
        localStorage.setItem("lastro:tema", t);
      }
      // Notification falsa: registra o que a página tentaria mostrar.
      window.__notificacoes = [];
      window.Notification = class {
        static permission = "granted";
        static requestPermission() { return Promise.resolve("granted"); }
        constructor(titulo, opcoes) { window.__notificacoes.push({ titulo, ...opcoes }); }
      };
    }, tema);
    await use(page);
  },
});

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

export async function axe(page) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

export async function lancarCompra(page, { simbolo = "PETR4", data = "2026-01-05", quantidade = "100", preco = "30,00", taxas = "" } = {}) {
  await page.getByLabel("Tipo", { exact: true }).selectOption("compra");
  await page.getByLabel("Ativo").first().fill(simbolo);
  await page.getByLabel("Data").fill(data);
  await page.getByLabel("Quantidade").fill(quantidade);
  await page.getByLabel("Preço por unidade (R$)").fill(preco);
  await page.getByLabel("Taxas (R$)").fill(taxas);
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
}
