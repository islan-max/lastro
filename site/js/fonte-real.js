// Fonte de cotações reais (atrasadas): o Worker de cache do Lastro. Só os símbolos saem do navegador.
const ORIGENS = new Set(["atrasado", "fechamento"]);
const TICKER = /^[A-Z]{4}\d{1,2}$/;

export function criarFonteReal(base) {
  const raiz = base.replace(/\/+$/, "");
  return {
    id: "real",
    rotulo: "Cotações atrasadas (brapi)",
    intervaloMs: 5 * 60 * 1000,
    async buscar(simbolos) {
      const cotacoes = {};
      const erros = {};
      const pendentes = [];
      for (let i = 0; i < simbolos.length; i += 20) {
        const lote = simbolos.slice(i, i + 20);
        const r = await fetch(`${raiz}/cotacoes?s=${encodeURIComponent(lote.join(","))}`, { signal: AbortSignal.timeout(15000), credentials: "omit", referrerPolicy: "no-referrer" });
        if (r.status === 429) throw new Error("Muitas consultas ao serviço de cotações. Tento de novo em instantes.");
        if (!r.ok) throw new Error(`O serviço de cotações respondeu ${r.status}.`);
        const j = await r.json();
        for (const [s, c] of Object.entries(j.cotacoes ?? {})) {
          if (!TICKER.test(s) || !Number.isSafeInteger(c?.precoCentavos) || c.precoCentavos <= 0 || !ORIGENS.has(c.origem) || Number.isNaN(Date.parse(c.horario))) continue;
          cotacoes[s] = { precoCentavos: c.precoCentavos, horario: c.horario, origem: c.origem, ...(c.desatualizado === true ? { desatualizado: true } : {}) };
        }
        for (const [s, m] of Object.entries(j.erros ?? {})) if (TICKER.test(s) && typeof m === "string") erros[s] = m.slice(0, 200);
        for (const s of j.pendentes ?? []) if (TICKER.test(s)) pendentes.push(s);
      }
      return { cotacoes, erros, pendentes };
    },
  };
}
