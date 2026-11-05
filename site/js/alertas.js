// Alertas de preço: { id, simbolo, direcao: "acima"|"abaixo", precoCentavos, disparadoEm: string|null }.
// Disparam uma vez e ficam "disparados" até o usuário rearmar.
import { SIMBOLO_RE } from "./simbolo.js";

export function validarAlerta(a) {
  const erros = [];
  if (!a || typeof a !== "object") return ["Alerta inválido."];
  if (typeof a.id !== "string" || !a.id || a.id.length > 64) erros.push("Identificador inválido.");
  if (typeof a.simbolo !== "string" || !SIMBOLO_RE.test(a.simbolo)) erros.push("Símbolo inválido.");
  if (a.direcao !== "acima" && a.direcao !== "abaixo") erros.push("Escolha acima ou abaixo.");
  if (!Number.isSafeInteger(a.precoCentavos) || a.precoCentavos <= 0) erros.push("O preço do alerta deve ser maior que zero.");
  if (a.disparadoEm !== null && typeof a.disparadoEm !== "string") erros.push("Estado do alerta inválido.");
  return erros;
}

/** Alertas armados cujo limite foi cruzado pela cotação atual. */
export function alertasCruzados(alertas, cotacoes) {
  return alertas.filter((a) => {
    if (a.disparadoEm !== null) return false;
    const preco = cotacoes[a.simbolo];
    if (!Number.isFinite(preco)) return false;
    return a.direcao === "acima" ? preco >= a.precoCentavos : preco <= a.precoCentavos;
  });
}
