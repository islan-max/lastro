// Dinheiro sempre em centavos inteiros; só aqui se converte de/para texto em reais.

const MAX_CENTAVOS = Number.MAX_SAFE_INTEGER / 1e6; // folga para multiplicar por quantidades

/** "1.234,56" | "1234,5" | "12" -> centavos inteiros, ou null se inválido. */
export function reaisParaCentavos(texto) {
  if (typeof texto !== "string") return null;
  const t = texto.trim().replace(/^R\$\s*/, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  const [inteiro, frac = ""] = t.replace(/\./g, "").split(",");
  const centavos = Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) && centavos <= MAX_CENTAVOS ? centavos : null;
}

const formatador = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarReais(centavos) {
  return formatador.format(centavos / 100);
}

/** Com sinal explícito (+R$ 1,00 / -R$ 1,00): a cor nunca é a única pista do ganho ou da perda. */
export function formatarReaisSinal(centavos) {
  return (centavos > 0 ? "+" : "") + formatarReais(centavos);
}

export function formatarPercentual(razao) {
  if (razao === null || !Number.isFinite(razao)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(razao);
}
