// Interface do Lastro. DOM montado só com createElement/textContent (nada do usuário vira HTML).
import { calcular, resumir, validarLancamento } from "./carteira.js";
import { alertasCruzados, validarAlerta } from "./alertas.js";
import { carregar, salvar, lerJson, paraJson, paraCsv, vazio } from "./armazenamento.js";
import { formatarPercentual, formatarReais, formatarReaisSinal, reaisParaCentavos } from "./moeda.js";
import { normalizarSimbolo } from "./simbolo.js";
import { CATALOGO, carteiraExemplo, fonteDemo } from "./demo.js";
import { criarFonteReal } from "./fonte-real.js";

const $ = (id) => document.getElementById(id);
const ROTULO_TIPO = { compra: "Compra", venda: "Venda", provento: "Provento" };
const ROTULO_SUBTIPO = { dividendo: "Dividendo", jcp: "JCP", rendimento: "Rendimento de FII" };

let dados = carregar();
let cotacoes = {}; // SIMBOLO -> { precoCentavos, horario, origem }
let semPreco = {}; // SIMBOLO -> mensagem
let fonte = fonteDemo;
let fonteReal = null; // só existe se o site aponta para um Worker (meta lastro-worker)
let temporizador = null;
let tentativasPendentes = 0;

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v;
    else if (k === "texto") e.textContent = v;
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const f of filhos) e.append(f);
  return e;
}

const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dataBR = (iso) => iso.split("-").reverse().join("/");
const hora = (iso, comSegundos) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: comSegundos ? "2-digit" : undefined });

function anunciar(msg) {
  const s = $("status");
  s.textContent = "";
  setTimeout(() => (s.textContent = msg), 50); // limpar antes faz o leitor de tela repetir mensagens iguais
}

function persistir() {
  if (!salvar(dados)) {
    const e = $("fonte-erro");
    e.textContent = "Não foi possível salvar neste navegador (modo privado ou sem espaço). Exporte seus dados para não perdê-los.";
    e.hidden = false;
  }
}

function confirmar(titulo, texto, ok = "Confirmar") {
  const d = $("dialogo");
  $("dialogo-titulo").textContent = titulo;
  $("dialogo-texto").textContent = texto;
  $("dialogo-ok").textContent = ok;
  return new Promise((resolve) => {
    d.addEventListener("close", () => resolve(d.returnValue === "ok"), { once: true });
    d.returnValue = "cancelar";
    d.showModal();
    $("dialogo-cancelar").focus();
  });
}

function descreverCotacao(c) {
  if (c.origem === "simulado") return `simulado, ${hora(c.horario, true)}`;
  const velho = c.desatualizado ? ", desatualizada" : "";
  if (c.origem === "fechamento") return `fechamento de ${dataBR(c.horario.slice(0, 10))}${velho}`;
  return `atrasada ~30 min, ${hora(c.horario)}${velho}`;
}

function celula(tag, texto, classe, extra) {
  const c = el(tag, { class: classe, texto });
  if (extra) c.append(extra);
  return c;
}

function resultadoSpan(centavos, razao) {
  if (centavos === null) return celula("span", "—");
  const s = el("span", { class: centavos > 0 ? "ganho" : centavos < 0 ? "perda" : "" , texto: formatarReaisSinal(centavos) });
  const pct = razao === null || razao === undefined ? "" : ` (${formatarPercentual(razao)})`;
  s.append(pct);
  return s;
}

// ---------- render ----------

function render() {
  const { posicoes, erros } = calcular(dados.lancamentos);
  const { linhas, total } = resumir(posicoes, Object.fromEntries(Object.entries(cotacoes).map(([s, c]) => [s, c.precoCentavos])));
  $("vazio").hidden = dados.lancamentos.length > 0;
  renderResumo(total, linhas, erros);
  renderPosicoes(linhas);
  renderLancamentos();
  renderAlertas();
  renderDados();
}

function renderResumo(t, linhas, erros) {
  const dl = $("resumo");
  dl.replaceChildren();
  const item = (rotulo, valor, sub) => {
    const dd = el("dd", {}, valor);
    if (sub) dd.append(el("small", { texto: sub }));
    dl.append(el("div", {}, el("dt", { texto: rotulo }), dd));
  };
  const comPreco = linhas.some((l) => l.valorAtualCentavos !== null);
  item("Valor de mercado", formatarReais(t.valorAtualCentavos), t.semCotacao ? `${t.semCotacao} ativo(s) sem preço, fora desta soma` : comPreco ? "pelos preços atrasados" : "sem preços ainda");
  item("Custo das posições abertas", formatarReais(t.custoCentavos));
  item("Resultado não realizado", resultadoSpan(t.naoRealizadoCentavos, t.naoRealizadoRazao));
  item("Resultado das vendas", resultadoSpan(t.realizadoCentavos, null), "pelo preço médio");
  item("Proventos recebidos", formatarReais(t.proventosCentavos));
  item("Retorno total", resultadoSpan(t.retornoTotalCentavos, t.retornoTotalRazao), "sobre tudo o que foi comprado");
  const aviso = $("fonte-erro");
  if (erros.length) {
    aviso.textContent = `Há lançamentos com problema: ${erros.map((e) => e.mensagem).join(" ")}`;
    aviso.hidden = false;
  } else if (!aviso.dataset.fixo) {
    aviso.hidden = true;
  }
}

function renderPosicoes(linhas) {
  const tb = $("tabela-posicoes").tBodies[0];
  tb.replaceChildren();
  if (linhas.length === 0) {
    tb.append(el("tr", {}, el("td", { colspan: 8, texto: "Sem posições ainda." })));
    return;
  }
  for (const l of linhas) {
    const aberta = l.quantidade > 0;
    const tr = el("tr");
    const ativo = el("th", { scope: "row", texto: l.simbolo });
    if (!aberta) ativo.append(el("small", { texto: "encerrada" }));
    tr.append(ativo);
    tr.append(celula("td", String(l.quantidade), "num"));
    tr.append(celula("td", l.precoMedioCentavos === null ? "—" : formatarReais(Math.round(l.precoMedioCentavos)), "num"));
    const c = cotacoes[l.simbolo];
    const preco = el("td", { class: "num" });
    if (!aberta) preco.append("—");
    else if (c) {
      preco.append(formatarReais(c.precoCentavos), el("small", { texto: descreverCotacao(c) }));
    } else {
      preco.append("sem preço", el("small", { texto: semPreco[l.simbolo] ?? "aguardando cotação" }));
    }
    tr.append(preco);
    tr.append(celula("td", aberta && l.valorAtualCentavos !== null ? formatarReais(l.valorAtualCentavos) : "—", "num"));
    tr.append(el("td", { class: "num" }, aberta ? resultadoSpan(l.naoRealizadoCentavos, l.naoRealizadoRazao) : "—"));
    tr.append(el("td", { class: "num" }, resultadoSpan(l.realizadoCentavos, null)));
    tr.append(celula("td", formatarReais(l.proventosCentavos), "num"));
    tb.append(tr);
  }
}

function renderLancamentos() {
  const lista = [...dados.lancamentos].sort((a, b) => b.data.localeCompare(a.data));
  $("sem-lancamentos").hidden = lista.length > 0;
  $("rolagem-lancamentos").hidden = lista.length === 0;
  const tb = $("tabela-lancamentos").tBodies[0];
  tb.replaceChildren();
  for (const l of lista) {
    const tr = el("tr");
    tr.append(celula("td", dataBR(l.data)));
    tr.append(celula("td", l.tipo === "provento" ? ROTULO_SUBTIPO[l.subtipo] : ROTULO_TIPO[l.tipo]));
    tr.append(el("th", { scope: "row", texto: l.simbolo }));
    const negocio = l.tipo !== "provento";
    tr.append(celula("td", negocio ? String(l.quantidade) : "—", "num"));
    tr.append(celula("td", negocio ? formatarReais(l.precoCentavos) : "—", "num"));
    tr.append(celula("td", negocio ? formatarReais(l.taxasCentavos) : "—", "num"));
    tr.append(celula("td", negocio ? formatarReais(l.quantidade * l.precoCentavos) : formatarReais(l.valorCentavos), "num"));
    const botao = el("button", { type: "button", class: "botao botao-leve", "aria-label": `Excluir ${ROTULO_TIPO[l.tipo].toLowerCase()} de ${l.simbolo} em ${dataBR(l.data)}`, texto: "Excluir" });
    botao.addEventListener("click", () => excluirLancamento(l));
    tr.append(el("td", {}, botao));
    tb.append(tr);
  }
}

function renderAlertas() {
  const ul = $("lista-alertas");
  ul.replaceChildren();
  if (dados.alertas.length === 0) ul.append(el("li", { texto: "Nenhum alerta criado." }));
  for (const a of dados.alertas) {
    const li = el("li", { class: a.disparadoEm ? "disparado" : "" });
    const c = cotacoes[a.simbolo];
    const texto = `${a.simbolo} ${a.direcao === "acima" ? "igual ou acima de" : "igual ou abaixo de"} ${formatarReais(a.precoCentavos)}`;
    const info = el("span", {}, el("strong", { texto }));
    if (a.disparadoEm) info.append(" ", el("span", { class: "etiqueta", texto: `disparado em ${dataBR(a.disparadoEm.slice(0, 10))} ${hora(a.disparadoEm)}` }));
    else if (c) info.append(` — último preço: ${formatarReais(c.precoCentavos)} (${descreverCotacao(c)})`);
    li.append(info);
    const acoes = el("span", { class: "acoes" });
    if (a.disparadoEm) {
      const re = el("button", { type: "button", class: "botao botao-leve", texto: "Rearmar", "aria-label": `Rearmar alerta de ${texto}` });
      re.addEventListener("click", () => {
        a.disparadoEm = null;
        persistir();
        render();
        anunciar(`Alerta de ${a.simbolo} rearmado.`);
        checarAlertas();
      });
      acoes.append(re);
    }
    const ex = el("button", { type: "button", class: "botao botao-leve", texto: "Excluir", "aria-label": `Excluir alerta de ${texto}` });
    ex.addEventListener("click", async () => {
      if (!(await confirmar("Excluir alerta?", texto, "Excluir"))) return;
      dados.alertas = dados.alertas.filter((x) => x.id !== a.id);
      persistir();
      render();
      anunciar("Alerta excluído.");
      $("a-simbolo").focus();
    });
    acoes.append(ex);
    li.append(acoes);
    ul.append(li);
  }
  renderNotificacoes();
}

function renderNotificacoes() {
  const estado = $("notif-estado");
  const botao = $("ativar-notificacoes");
  botao.hidden = true;
  if (!("Notification" in window)) estado.textContent = "Este navegador não tem notificações. Os avisos aparecem só nesta página.";
  else if (Notification.permission === "granted") estado.textContent = "Notificações do navegador ativadas (só funcionam com esta página aberta). Os avisos também aparecem aqui.";
  else if (Notification.permission === "denied") estado.textContent = "As notificações estão bloqueadas neste navegador. Os avisos aparecem só nesta página.";
  else {
    estado.textContent = "As notificações do navegador ainda não estão ativadas.";
    botao.hidden = false;
  }
}

function renderDados() {
  $("backup-estado").textContent = dados.ultimoBackup
    ? `Último backup exportado em ${dataBR(dados.ultimoBackup.slice(0, 10))}. O navegador pode apagar dados do site; exporte de tempos em tempos.`
    : "Você ainda não exportou um backup. O navegador pode apagar dados do site sem aviso; exporte de tempos em tempos.";
}

// ---------- preços e alertas ----------

function simbolosNecessarios() {
  const { posicoes } = calcular(dados.lancamentos);
  const s = new Set(Object.values(posicoes).filter((p) => p.quantidade > 0).map((p) => p.simbolo));
  for (const a of dados.alertas) if (a.disparadoEm === null) s.add(a.simbolo);
  return [...s];
}

async function atualizarPrecos() {
  const simbolos = simbolosNecessarios();
  if (simbolos.length === 0) return;
  try {
    const usada = fonte;
    const r = await usada.buscar(simbolos);
    if (usada !== fonte) return; // o usuário trocou de fonte no meio da busca
    Object.assign(cotacoes, r.cotacoes);
    semPreco = { ...r.erros, ...Object.fromEntries((r.pendentes ?? []).map((s) => [s, "buscando o preço…"])) };
    const aviso = $("fonte-erro");
    delete aviso.dataset.fixo;
    const faltam = Object.entries(r.erros);
    if (faltam.length) {
      aviso.textContent = `Sem preço para: ${faltam.map(([s, m]) => `${s} (${m})`).join("; ")}`;
      aviso.dataset.fixo = "1";
      aviso.hidden = false;
    }
    if (r.pendentes?.length && tentativasPendentes < 6) {
      // O serviço busca poucos ativos por vez para respeitar a cota: pede o resto em seguida.
      tentativasPendentes += 1;
      setTimeout(atualizarPrecos, 4000);
    } else {
      tentativasPendentes = 0;
    }
  } catch (e) {
    $("fonte-erro").textContent = `${fonte.id === "real" ? (e?.message ?? "Não consegui buscar os preços agora.") : "Não consegui buscar os preços agora."} Mostrando o último preço que tenho; tento de novo em instantes. Você pode trocar para a demonstração.`;
    $("fonte-erro").dataset.fixo = "1";
    $("fonte-erro").hidden = false;
  }
  render();
  checarAlertas();
}

function aplicarFonte(nova) {
  fonte = nova;
  cotacoes = {}; // nunca mistura preço simulado com preço real
  semPreco = {};
  tentativasPendentes = 0;
  $("fonte-estado").textContent = fonte.id === "real" ? "atrasados (reais)" : "demonstração";
  $("aviso-fonte").textContent =
    fonte.id === "real"
      ? "Cotações com atraso de cerca de 30 minutos, fornecidas pela brapi. Fora do pregão (seg–sex, 10h–18h) valem o último fechamento."
      : "Modo demonstração: todos os preços são simulados (movem-se a cada 15 s só para você ver o Lastro funcionando) e não valem nada.";
  clearInterval(temporizador);
  temporizador = setInterval(atualizarPrecos, fonte.intervaloMs);
  render();
  atualizarPrecos();
}

function alternarFonte() {
  const nova = fonte.id === "real" ? fonteDemo : fonteReal;
  try {
    localStorage.setItem("lastro:fonte", nova.id);
  } catch {
    /* vale só nesta visita */
  }
  aplicarFonte(nova);
  anunciar(`Preços: ${$("fonte-estado").textContent}.`);
}

function checarAlertas() {
  const mapa = Object.fromEntries(Object.entries(cotacoes).map(([s, c]) => [s, c.precoCentavos]));
  const cruzados = alertasCruzados(dados.alertas, mapa);
  if (cruzados.length === 0) return;
  const agora = new Date().toISOString();
  for (const a of cruzados) {
    a.disparadoEm = agora;
    const c = cotacoes[a.simbolo];
    const msg = `${a.simbolo} ficou ${a.direcao === "acima" ? "igual ou acima de" : "igual ou abaixo de"} ${formatarReais(a.precoCentavos)} (último preço ${formatarReais(c.precoCentavos)}, ${descreverCotacao(c)}).`;
    anunciar(`Alerta: ${msg}`);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(`Lastro: ${a.simbolo}`, { body: msg, tag: `lastro-${a.id}` });
      } catch {
        /* alguns navegadores móveis só permitem via service worker; o aviso na página continua */
      }
    }
  }
  persistir();
  render();
}

// ---------- formulários ----------

function erroCampo(id, msg, prefixo = "e") {
  const campo = $(id);
  const p = $(`${prefixo}-${id.split("-")[1]}`);
  if (!campo || !p) return;
  if (campo.dataset.base === undefined) campo.dataset.base = campo.getAttribute("aria-describedby") ?? "";
  if (msg) {
    p.textContent = msg;
    p.hidden = false;
    campo.setAttribute("aria-invalid", "true");
    campo.setAttribute("aria-describedby", `${campo.dataset.base} ${p.id}`.trim());
  } else {
    p.hidden = true;
    campo.removeAttribute("aria-invalid");
    campo.setAttribute("aria-describedby", campo.dataset.base);
    if (!campo.dataset.base) campo.removeAttribute("aria-describedby");
  }
}

function trocarTipo() {
  const tipo = $("f-tipo").value;
  for (const c of document.querySelectorAll("#form-lancamento [data-so]")) {
    const mostrar = (c.dataset.so === "negocio") === (tipo !== "provento");
    c.hidden = !mostrar;
  }
}

function lerFormulario() {
  const tipo = $("f-tipo").value;
  const erros = {};
  const simbolo = normalizarSimbolo($("f-simbolo").value);
  if (!simbolo) erros["f-simbolo"] = "Informe um símbolo válido, como PETR4 ou HGLG11.";
  const data = $("f-data").value;
  if (!data) erros["f-data"] = "Informe a data.";
  else if (data > hojeISO()) erros["f-data"] = "A data não pode ser futura.";
  const l = { id: crypto.randomUUID(), tipo, simbolo, data };
  if (tipo === "provento") {
    const v = reaisParaCentavos($("f-valor").value);
    if (v === null || v <= 0) erros["f-valor"] = "Informe o valor recebido, maior que zero (ex.: 12,34).";
    l.valorCentavos = v;
    l.subtipo = $("f-subtipo").value;
  } else {
    const qtdTexto = $("f-quantidade").value.trim();
    const qtd = /^\d+$/.test(qtdTexto) ? Number(qtdTexto) : null;
    if (!qtd) erros["f-quantidade"] = "Informe um número inteiro maior que zero.";
    const preco = reaisParaCentavos($("f-preco").value);
    if (preco === null || preco <= 0) erros["f-preco"] = "Informe o preço por unidade, maior que zero (ex.: 30,50).";
    const taxasTexto = $("f-taxas").value.trim();
    const taxas = taxasTexto === "" ? 0 : reaisParaCentavos(taxasTexto);
    if (taxas === null) erros["f-taxas"] = "Valor inválido (ex.: 4,90).";
    Object.assign(l, { quantidade: qtd, precoCentavos: preco, taxasCentavos: taxas });
  }
  return { l, erros };
}

function enviarLancamento(ev) {
  ev.preventDefault();
  const { l, erros } = lerFormulario();
  for (const id of ["f-simbolo", "f-data", "f-quantidade", "f-preco", "f-taxas", "f-valor"]) erroCampo(id, erros[id] ?? "");
  $("e-form").hidden = true;
  const ids = Object.keys(erros);
  if (ids.length) {
    $(ids[0]).focus();
    return;
  }
  const extra = validarLancamento(l);
  if (extra.length) return mostrarErroForm(extra[0]);
  if (calcular([...dados.lancamentos, l]).erros.some((e) => e.id === l.id)) {
    return mostrarErroForm(`Você não tinha ${l.quantidade} de ${l.simbolo} até ${dataBR(l.data)} para vender.`);
  }
  dados.lancamentos.push(l);
  persistir();
  const resumo = l.tipo === "provento" ? `Provento de ${formatarReais(l.valorCentavos)} em ${l.simbolo}` : `${ROTULO_TIPO[l.tipo]} de ${l.quantidade} ${l.simbolo}`;
  for (const id of ["f-simbolo", "f-quantidade", "f-preco", "f-taxas", "f-valor"]) $(id).value = "";
  render();
  anunciar(`${resumo} adicionado.`);
  $("f-simbolo").focus();
  atualizarPrecos();
}

function mostrarErroForm(msg) {
  const p = $("e-form");
  p.textContent = msg;
  p.hidden = false;
}

function enviarAlerta(ev) {
  ev.preventDefault();
  const simbolo = normalizarSimbolo($("a-simbolo").value);
  const preco = reaisParaCentavos($("a-preco").value);
  erroCampo("a-simbolo", simbolo ? "" : "Informe um símbolo válido, como PETR4.", "ea");
  erroCampo("a-preco", preco && preco > 0 ? "" : "Informe um preço maior que zero (ex.: 40,00).", "ea");
  if (!simbolo) return $("a-simbolo").focus();
  if (!preco || preco <= 0) return $("a-preco").focus();
  const a = { id: crypto.randomUUID(), simbolo, direcao: $("a-direcao").value, precoCentavos: preco, disparadoEm: null };
  if (validarAlerta(a).length) return;
  dados.alertas.push(a);
  persistir();
  $("a-simbolo").value = "";
  $("a-preco").value = "";
  render();
  anunciar(`Alerta criado para ${simbolo}.`);
  $("a-simbolo").focus();
  atualizarPrecos();
}

async function excluirLancamento(l) {
  const desc = l.tipo === "provento" ? `provento de ${l.simbolo} em ${dataBR(l.data)}` : `${ROTULO_TIPO[l.tipo].toLowerCase()} de ${l.quantidade} ${l.simbolo} em ${dataBR(l.data)}`;
  if (!(await confirmar("Excluir lançamento?", `Excluir ${desc}? Isto muda a posição e o preço médio.`, "Excluir"))) return;
  dados.lancamentos = dados.lancamentos.filter((x) => x.id !== l.id);
  persistir();
  render();
  anunciar("Lançamento excluído.");
  $("h-lancamentos").setAttribute("tabindex", "-1");
  $("h-lancamentos").focus();
}

// ---------- dados ----------

function baixar(nome, texto, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = el("a", { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarJson() {
  dados.ultimoBackup = new Date().toISOString();
  persistir();
  baixar(`lastro-${hojeISO()}.json`, paraJson(dados), "application/json");
  renderDados();
  anunciar("Backup exportado.");
}

async function importar(ev) {
  const arquivo = ev.target.files[0];
  ev.target.value = "";
  if (!arquivo) return;
  if (arquivo.size > 5 * 1024 * 1024) return anunciar("Arquivo grande demais.");
  const r = lerJson(await arquivo.text());
  if (r.erro) {
    const e = $("fonte-erro");
    e.textContent = `Não importei: ${r.erro}`;
    e.dataset.fixo = "1";
    e.hidden = false;
    return anunciar(`Não importei: ${r.erro}`);
  }
  if (!(await confirmar("Substituir seus dados?", `Isto troca tudo o que está aqui pelos ${r.dados.lancamentos.length} lançamentos e ${r.dados.alertas.length} alertas do arquivo.`, "Substituir"))) return;
  dados = r.dados;
  delete $("fonte-erro").dataset.fixo;
  persistir();
  render();
  anunciar("Dados importados.");
  atualizarPrecos();
}

async function apagarTudo() {
  if (!(await confirmar("Apagar tudo?", "Remove lançamentos e alertas deste navegador. Se não exportou um backup, não dá para desfazer.", "Apagar tudo"))) return;
  dados = vazio();
  cotacoes = {};
  persistir();
  render();
  anunciar("Tudo apagado.");
}

async function carregarExemplo() {
  if (dados.lancamentos.length && !(await confirmar("Carregar exemplo?", "Substitui seus lançamentos pela carteira de exemplo (dados fictícios).", "Substituir"))) return;
  dados.lancamentos = carteiraExemplo();
  persistir();
  render();
  anunciar("Carteira de exemplo carregada.");
  atualizarPrecos();
}

// ---------- tema ----------

function aplicarTema(t) {
  if (t === "claro" || t === "escuro") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  $("tema-estado").textContent = t === "claro" || t === "escuro" ? t : "sistema";
}

function alternarTema() {
  const atual = document.documentElement.dataset.theme ?? "sistema";
  const prox = { sistema: "claro", claro: "escuro", escuro: "sistema" }[atual];
  try {
    if (prox === "sistema") localStorage.removeItem("lastro:tema");
    else localStorage.setItem("lastro:tema", prox);
  } catch {
    /* sem localStorage: vale só nesta visita */
  }
  aplicarTema(prox);
}

// ---------- início ----------

function iniciar() {
  const dl = $("lista-ativos");
  for (const a of CATALOGO) dl.append(el("option", { value: a.simbolo, label: a.nome }));
  $("f-data").value = hojeISO();
  $("f-data").max = hojeISO();
  const worker = document.querySelector('meta[name="lastro-worker"]')?.content.trim();
  if (worker && /^https:\/\/[^/\s]+$/.test(worker)) {
    fonteReal = criarFonteReal(worker);
    $("alternar-fonte").hidden = false;
    $("alternar-fonte").addEventListener("click", alternarFonte);
    let preferida = "real";
    try {
      preferida = localStorage.getItem("lastro:fonte") ?? "real";
    } catch {
      /* usa o padrão */
    }
    fonte = preferida === "demo" ? fonteDemo : fonteReal;
  }
  aplicarTema(document.documentElement.dataset.theme);
  trocarTipo();

  $("f-tipo").addEventListener("change", trocarTipo);
  $("form-lancamento").addEventListener("submit", enviarLancamento);
  $("form-alerta").addEventListener("submit", enviarAlerta);
  $("alternar-tema").addEventListener("click", alternarTema);
  $("carregar-exemplo").addEventListener("click", carregarExemplo);
  $("exportar-json").addEventListener("click", exportarJson);
  $("exportar-csv").addEventListener("click", () => baixar(`lastro-lancamentos-${hojeISO()}.csv`, `﻿${paraCsv(dados.lancamentos)}`, "text/csv;charset=utf-8"));
  $("importar-json").addEventListener("change", importar);
  $("apagar-tudo").addEventListener("click", apagarTudo);
  $("ativar-notificacoes").addEventListener("click", async () => {
    await Notification.requestPermission();
    renderNotificacoes();
    anunciar($("notif-estado").textContent);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) atualizarPrecos();
  });

  aplicarFonte(fonte);
}

iniciar();
