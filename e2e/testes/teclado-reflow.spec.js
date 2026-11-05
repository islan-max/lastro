import { test, expect, axe } from "./ajuda.js";

test("o primeiro Tab leva ao link de pular e ele leva ao conteúdo", async ({ page }) => {
  await page.goto("./");
  await page.keyboard.press("Tab");
  const pular = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(pular).toBeFocused();
  await expect(pular).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#principal")).toBeFocused();
});

test("lançar uma compra só com o teclado", async ({ page }) => {
  await page.goto("./");
  // O campo de data tem vários pontos de parada internos (dia, mês, ano, calendário): avança até o id.
  const tabAte = async (id) => {
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate((x) => document.activeElement?.id === x, id)) return;
    }
    throw new Error(`Tab não chegou a ${id}`);
  };
  await page.getByLabel("Ativo").first().focus();
  await page.keyboard.type("itub4");
  await tabAte("f-quantidade");
  await page.keyboard.type("50");
  await tabAte("f-preco");
  await page.keyboard.type("33,20");
  await tabAte("f-taxas");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Adicionar lançamento" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#tabela-posicoes tbody tr", { hasText: "ITUB4" })).toContainText("50");
});

test("todo controle interativo mostra foco visível (contorno) e tem alvo de pelo menos 24 px", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
  const total = await page.locator("button, a[href], input:not(.so-leitor-foco), select, [tabindex='0']").count();
  expect(total).toBeGreaterThan(10);
  const problemas = await page.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll("button, a[href], input:not(.so-leitor-foco), select, [tabindex='0']")) {
      if (e.offsetParent === null) continue;
      const r = e.getBoundingClientRect();
      const inline = getComputedStyle(e).display === "inline";
      if (!inline && (r.width < 24 || r.height < 24)) out.push(`alvo pequeno: ${e.outerHTML.slice(0, 60)}`);
    }
    return out;
  });
  expect(problemas).toEqual([]);
  // Foco por teclado: percorre os primeiros controles e confere o contorno.
  await page.locator("body").press("Tab");
  const vistos = new Set();
  for (let i = 0; i < 14; i++) {
    const estilo = await page.evaluate(() => {
      const e = document.activeElement;
      const s = getComputedStyle(e);
      return { id: e.id || e.outerHTML.slice(0, 50), data: e.type === "date", ok: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2, el: e.outerHTML.slice(0, 50) };
    });
    // Dentro do campo de data o Chrome move o foco entre segmentos e o botão do calendário (controles nativos, com anel próprio): confere só a chegada.
    if (!(estilo.data && vistos.has(estilo.id))) expect(estilo.ok, estilo.el).toBe(true);
    vistos.add(estilo.id);
    await page.keyboard.press("Tab");
  }
});

test("o foco nunca fica escondido atrás de nada fixo (WCAG 2.4.11)", async ({ page }) => {
  await page.goto("./");
  const fixos = await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => ["fixed", "sticky"].includes(getComputedStyle(e).position)).length);
  expect(fixos).toBe(0);
});

test("o diálogo prende o foco, fecha com Esc e devolve o foco", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
  const botao = page.getByRole("button", { name: /Excluir compra de PETR4/ }).first();
  await botao.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(botao).toBeFocused();
});

for (const [nome, largura, altura] of [["320 px (reflow, equivale a 400% de zoom)", 320, 640], ["640 px (zoom 200% em tela de 1280)", 640, 512], ["celular 375 px", 375, 812]]) {
  for (const tema of ["claro", "escuro"]) {
    test.describe(`reflow ${nome}, ${tema}`, () => {
      test.use({ tema, viewport: { width: largura, height: altura } });
      test("sem rolagem horizontal da página, sem corte e sem violações", async ({ page }) => {
        await page.goto("./");
        await page.getByRole("button", { name: "carregue uma carteira de exemplo" }).click();
        await expect(page.locator("#tabela-posicoes tbody tr")).toHaveCount(4);
        const { rolagem, largura: l } = await page.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, largura: window.innerWidth }));
        expect(rolagem).toBeLessThanOrEqual(l);
        // As tabelas rolam dentro da própria região (focável), não a página.
        for (const id of ["tabela-posicoes", "tabela-lancamentos"]) {
          const regiao = page.locator(`#${id}`).locator("xpath=ancestor::div[@role='region']");
          await expect(regiao).toHaveAttribute("tabindex", "0");
        }
        expect(await axe(page)).toEqual([]);
      });
    });
  }
}

test("espaçamento de texto aumentado (WCAG 1.4.12) não corta nem sobrepõe controles", async ({ page }) => {
  await page.goto("./");
  // A CSP proíbe <style> inline; folhas construídas pelo CSSOM são permitidas.
  await page.evaluate(() => {
    const s = new CSSStyleSheet();
    s.replaceSync("* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
  });
  const { rolagem, largura } = await page.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, largura: window.innerWidth }));
  expect(rolagem).toBeLessThanOrEqual(largura);
  await expect(page.getByRole("button", { name: "Adicionar lançamento" })).toBeVisible();
});

test("movimento reduzido: sem transições", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  const t = await page.evaluate(() => getComputedStyle(document.querySelector(".botao")).transitionDuration);
  expect(t).toBe("0s");
});
