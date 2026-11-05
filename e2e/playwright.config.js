import { defineConfig } from "@playwright/test";

// LASTRO_URL aponta para o endereço publicado (ex.: https://islan-max.github.io/lastro/); sem ele sobe o servidor local.
const remoto = process.env.LASTRO_URL;
const base = (remoto ?? "http://localhost:4173/lastro/").replace(/\/?$/, "/");

export default defineConfig({
  testDir: "testes",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: base,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    // Local: usa o Chrome instalado (LASTRO_BROWSER=chrome); no CI: o Chromium do Playwright.
    channel: process.env.LASTRO_BROWSER || undefined,
  },
  webServer: remoto ? undefined : { command: "node servidor.js", url: base, reuseExistingServer: true, timeout: 15_000 },
});
