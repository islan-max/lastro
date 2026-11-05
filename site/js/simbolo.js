// Símbolos da B3: 4 letras + 1 ou 2 dígitos (PETR4, VALE3, HGLG11, BOVA11). Maiúsculas.
export const SIMBOLO_RE = /^[A-Z]{4}\d{1,2}$/;

export function normalizarSimbolo(texto) {
  const s = String(texto ?? "").trim().toUpperCase();
  return SIMBOLO_RE.test(s) ? s : null;
}
