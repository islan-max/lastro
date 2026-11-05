// Aplica o tema salvo antes de pintar (script clássico no <head>, sem inline por causa da CSP).
try {
  const t = localStorage.getItem("lastro:tema");
  if (t === "claro" || t === "escuro") document.documentElement.dataset.theme = t;
} catch {
  /* sem localStorage: segue a preferência do sistema */
}
