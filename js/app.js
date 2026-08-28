/* ===========================================================
   App — controle de telas, eventos e renderização
   =========================================================== */
(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    lancamentos: [],
    period: "hoje",
    range: { start: null, end: null },
    filters: { conta: "", tipo: "", categoria: "", responsavel: "", start: "", end: "", q: "" },
    receiptFile: null,     // File a enviar
    editingKeepReceipt: true,
    voiceParsed: null
  };

  /* ===================== BOOT ===================== */
  async function boot() {
    await Store.init();
    populateSelects();
    bindGlobal();
    if (Store.mode === "supabase" && !Store.user) showLogin();
    else if (Store.mode === "supabase" && Store.user) startApp();
    else showLogin();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
    setupInstall();
    setupOffline();
  }

  /* Instalação do PWA */
  let deferredPrompt = null;
  function setupInstall() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const b = $("#btn-install"); if (b) b.hidden = false;
    });
    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      const b = $("#btn-install"); if (b) b.hidden = true;
      toast("App instalado! 🎉", "ok");
    });
    const btn = $("#btn-install");
    if (btn) btn.addEventListener("click", async () => {
      if (!deferredPrompt) { toast("Use o menu do navegador ▸ “Instalar app”.", ""); return; }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null; btn.hidden = true;
    });
  }

  /* Indicador offline */
  function setupOffline() {
    const upd = () => { const b = $("#offline-banner"); if (b) b.hidden = navigator.onLine; };
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    upd();
  }

  function showLogin() {
    $("#app-shell").hidden = true;
    $("#view-login").hidden = false;
  }

  async function startApp() {
    $("#view-login").hidden = true;
    $("#app-shell").hidden = false;
    $("#demo-banner").hidden = !Store.isDemo();
    $("#hello-user").textContent = "Olá 👋 " + (Store.currentUserLabel().split("@")[0] || "");
    // responsável padrão
    const resp = $("#f-responsavel");
    if (resp && !resp.value) resp.value = Store.isDemo() ? "" : (Store.currentUserLabel().split("@")[0] || "");
    await reload();
    navTo("painel");
  }

  async function reload() {
    try {
      state.lancamentos = await Store.listLancamentos();
    } catch (e) {
      console.error(e); toast("Erro ao carregar dados.", "err");
      state.lancamentos = [];
    }
  }

  /* ===================== SELECTS ===================== */
  function fillSelect(el, items, { placeholder } = {}) {
    if (!el) return;
    el.innerHTML = "";
    if (placeholder) el.appendChild(new Option(placeholder, ""));
    items.forEach(i => el.appendChild(new Option(i.nome, i.id)));
  }
  function populateSelects() {
    fillSelect($("#f-conta"), HAIR.CONTAS);
    fillSelect($("#f-categoria"), HAIR.CATEGORIAS);
    fillSelect($("#f-forma"), HAIR.FORMAS);
    fillSelect($("#filt-conta"), HAIR.CONTAS, { placeholder: "Todas as contas" });
    fillSelect($("#filt-tipo"), [{ id: "entrada", nome: "Entradas" }, { id: "saida", nome: "Saídas" }], { placeholder: "Todos os tipos" });
    fillSelect($("#filt-categoria"), HAIR.CATEGORIAS, { placeholder: "Todas as categorias" });
  }

  /* ===================== ROUTER ===================== */
  function navTo(view) {
    ["painel", "novo", "extrato"].forEach(v => { const el = $("#view-" + v); if (el) el.hidden = v !== view; });
    $$(".nav-item").forEach(b => b.classList.toggle("is-active", b.dataset.nav === view));
    $("#fab-novo").hidden = (view === "novo");
    window.scrollTo(0, 0);
    if (view === "painel") renderPainel();
    if (view === "extrato") renderExtrato();
  }

  /* ===================== PERÍODO ===================== */
  function periodBounds() {
    const now = new Date();
    let start, end = null;
    if (state.period === "hoje") { start = new Date(now); start.setHours(0, 0, 0, 0); }
    else if (state.period === "semana") {
      start = new Date(now); const dow = (start.getDay() + 6) % 7; // segunda=0
      start.setDate(start.getDate() - dow); start.setHours(0, 0, 0, 0);
    } else if (state.period === "mes") { start = new Date(now.getFullYear(), now.getMonth(), 1); }
    else { // custom
      start = state.range.start ? new Date(state.range.start + "T00:00:00") : null;
      end   = state.range.end ? new Date(state.range.end + "T23:59:59") : null;
    }
    return { start, end };
  }
  function inPeriod(l) {
    const { start, end } = periodBounds();
    const d = new Date(l.data_movimento);
    if (start && d < start) return false;
    if (end && d > end) return false;
    if (!start && !end) return true;
    if (start && !end && state.period !== "custom") {
      // limite superior = fim de hoje para hoje/semana/mes
      return d <= new Date(new Date().setHours(23, 59, 59, 999));
    }
    return true;
  }

  /* ===================== CÁLCULOS ===================== */
  const soma = (arr) => arr.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  function accountBalance(id, list = state.lancamentos) {
    const inn = soma(list.filter(l => l.conta === id && l.tipo === "entrada"));
    const out = soma(list.filter(l => l.conta === id && l.tipo === "saida"));
    return inn - out;
  }

  /* ===================== PAINEL ===================== */
  function renderPainel() {
    const doPeriodo = state.lancamentos.filter(inPeriod);
    const entradas = soma(doPeriodo.filter(l => l.tipo === "entrada"));
    const saidas   = soma(doPeriodo.filter(l => l.tipo === "saida"));
    $("#stat-entradas").textContent = HAIR.brl(entradas);
    $("#stat-saidas").textContent   = HAIR.brl(saidas);

    const resultado = entradas - saidas;
    const pr = $("#period-result");
    if (pr) {
      const pos = resultado >= 0;
      pr.className = "period-result " + (pos ? "pos" : "neg");
      pr.innerHTML = `<span>${pos ? "📈" : "📉"} Resultado do período</span><strong>${(pos ? "+" : "−") + " " + HAIR.brl(Math.abs(resultado)).replace("R$", "R$")}</strong>`;
    }

    const saldoGeral = HAIR.CONTAS.reduce((s, c) => s + accountBalance(c.id), 0);
    $("#stat-saldo").textContent = HAIR.brl(saldoGeral);
    $(".stat-saldo").classList.toggle("neg", saldoGeral < 0);

    // contas
    const grid = $("#accounts-grid"); grid.innerHTML = "";
    HAIR.CONTAS.forEach((c, i) => {
      const bal = accountBalance(c.id);
      const el = document.createElement("button");
      el.className = "account-card";
      el.type = "button";
      el.style.setProperty("--acc", c.cor);
      el.style.animationDelay = (i * 50) + "ms";
      el.innerHTML = `<div class="account-name">${c.nome}</div>
        <div class="account-bal${bal < 0 ? " neg" : ""}">${HAIR.brl(bal)}</div>
        <div class="account-go">Ver extrato ›</div>`;
      el.addEventListener("click", () => {
        state.filters = { conta: c.id, tipo: "", categoria: "", responsavel: "", start: "", end: "", q: "" };
        syncFilterInputs();
        navTo("extrato");
      });
      grid.appendChild(el);
    });

    // últimas movimentações (5)
    const ult = [...state.lancamentos].slice(0, 5);
    renderTxList($("#painel-tx-list"), ult, "Sem movimentações ainda.");
  }

  /* ===================== EXTRATO ===================== */
  function applyFilters(list) {
    const f = state.filters;
    return list.filter(l => {
      if (f.conta && l.conta !== f.conta) return false;
      if (f.tipo && l.tipo !== f.tipo) return false;
      if (f.categoria && l.categoria !== f.categoria) return false;
      if (f.responsavel && (l.responsavel || "") !== f.responsavel) return false;
      if (f.start && new Date(l.data_movimento) < new Date(f.start + "T00:00:00")) return false;
      if (f.end && new Date(l.data_movimento) > new Date(f.end + "T23:59:59")) return false;
      if (f.q) {
        const hay = ((l.descricao || "") + " " + (l.responsavel || "") + " " + HAIR.catNome(l.categoria)).toLowerCase();
        if (!hay.includes(f.q.toLowerCase())) return false;
      }
      return true;
    });
  }
  function syncFilterInputs() {
    const f = state.filters;
    const set = (sel, val) => { const el = $(sel); if (el) el.value = val || ""; };
    set("#filt-conta", f.conta); set("#filt-tipo", f.tipo); set("#filt-categoria", f.categoria);
    set("#filt-responsavel", f.responsavel); set("#filt-start", f.start); set("#filt-end", f.end);
    set("#extrato-search", f.q);
  }

  function renderExtrato() {
    // responsáveis dinâmicos
    const resps = [...new Set(state.lancamentos.map(l => l.responsavel).filter(Boolean))]
      .map(r => ({ id: r, nome: r }));
    const cur = state.filters.responsavel;
    fillSelect($("#filt-responsavel"), resps, { placeholder: "Todos os responsáveis" });
    if (cur) $("#filt-responsavel").value = cur;

    const list = applyFilters(state.lancamentos);
    const entradas = soma(list.filter(l => l.tipo === "entrada"));
    const saidas   = soma(list.filter(l => l.tipo === "saida"));
    $("#extrato-summary").innerHTML = `
      <div class="es"><div class="es-label">Entradas</div><div class="es-val es-in">${HAIR.brl(entradas)}</div></div>
      <div class="es"><div class="es-label">Saídas</div><div class="es-val es-out">${HAIR.brl(saidas)}</div></div>
      <div class="es"><div class="es-label">Resultado</div><div class="es-val">${HAIR.brl(entradas - saidas)}</div></div>`;
    renderCatBreakdown(list);
    renderTxList($("#extrato-tx-list"), list, "Nenhum lançamento encontrado com esses filtros.", true);
  }

  function renderCatBreakdown(list) {
    const box = $("#cat-breakdown-body");
    const det = $("#cat-breakdown");
    if (!box) return;
    if (!list.length) { det.hidden = true; return; }
    det.hidden = false;
    // agrupa por categoria (valor absoluto movimentado)
    const map = {};
    list.forEach(l => {
      const k = l.categoria || "outros";
      if (!map[k]) map[k] = { in: 0, out: 0 };
      if (l.tipo === "entrada") map[k].in += Number(l.valor) || 0;
      else map[k].out += Number(l.valor) || 0;
    });
    const rows = Object.entries(map)
      .map(([k, v]) => ({ id: k, total: v.in + v.out, in: v.in, out: v.out }))
      .sort((a, b) => b.total - a.total);
    const max = Math.max(...rows.map(r => r.total), 1);
    box.innerHTML = rows.map(r => {
      const cor = HAIR.catCor(r.id);
      const pct = Math.round((r.total / max) * 100);
      const detalhe = r.in && r.out
        ? `<span class="cb-in">+${HAIR.brl(r.in)}</span> <span class="cb-out">−${HAIR.brl(r.out)}</span>`
        : r.in ? `<span class="cb-in">${HAIR.brl(r.in)}</span>`
               : `<span class="cb-out">${HAIR.brl(r.out)}</span>`;
      return `<div class="cb-row">
        <div class="cb-top"><span class="cb-name">${HAIR.catIcone(r.id)} ${HAIR.catNome(r.id)}</span><span class="cb-val">${detalhe}</span></div>
        <div class="cb-track"><div class="cb-fill" style="width:${pct}%;background:${cor}"></div></div>
      </div>`;
    }).join("");
  }

  /* ===================== LISTA DE TRANSAÇÕES ===================== */
  function buildTxItem(l, idx) {
    const li = document.createElement("li");
    const item = document.createElement("div");
    item.className = "tx-item " + (l.tipo === "entrada" ? "entrada-row" : "saida-row");
    item.style.animationDelay = Math.min(idx * 40, 400) + "ms";

    const hasImg = l.comprovante_url && !Store.receiptIsPdf(l);
    const hasPdf = l.comprovante_url && Store.receiptIsPdf(l);
    const catCor = HAIR.catCor(l.categoria);
    // Avatar: miniatura do comprovante (se imagem) OU ícone da categoria colorido
    let thumbInner, thumbClass = "tx-thumb";
    if (hasImg && Store.isDemo()) { thumbInner = `<img src="${l.comprovante_url}" alt="Comprovante">`; thumbClass += " has-receipt"; }
    else if (hasImg) { thumbInner = `<span class="tx-ph">📷</span>`; thumbClass += " has-receipt"; }
    else if (hasPdf) { thumbInner = `<span class="tx-ph">📄</span>`; thumbClass += " has-receipt"; }
    else { thumbInner = `<span class="tx-cat" style="background:${catCor}1f;color:${catCor}">${HAIR.catIcone(l.categoria)}</span>`; }

    const sinal = l.tipo === "entrada" ? "+" : "−";
    const demo = l.demo ? `<span class="demo-tag">DEMO</span>` : "";
    const clip = l.comprovante_url
      ? `<button class="tx-clip has" type="button" title="Ver comprovante">📎 ver</button>`
      : `<span class="tx-clip none">sem comprovante</span>`;

    item.innerHTML = `
      <button class="tx-thumb-btn ${thumbClass}" type="button" aria-label="Ver comprovante">${thumbInner}</button>
      <button class="tx-main" type="button">
        <div class="tx-desc">${escapeHtml(l.descricao || "Lançamento")}${demo}</div>
        <div class="tx-meta"><span class="tx-cat-dot" style="background:${catCor}"></span>${HAIR.catNome(l.categoria)} · ${HAIR.contaNome(l.conta)} · ${HAIR.fmtData(l.data_movimento)}</div>
      </button>
      <div class="tx-right">
        <div class="tx-value ${l.tipo}">${sinal} ${HAIR.brl(l.valor).replace("R$", "").trim()}</div>
        ${clip}
      </div>`;

    item.querySelector(".tx-main").addEventListener("click", () => openDetalhe(l));
    const thumbBtn = item.querySelector(".tx-thumb-btn");
    const clipBtn = item.querySelector(".tx-clip.has");
    const openReceiptOrDetail = (e) => {
      e.stopPropagation();
      if (l.comprovante_url) openReceipt(l); else openDetalhe(l);
    };
    thumbBtn.addEventListener("click", openReceiptOrDetail);
    if (clipBtn) clipBtn.addEventListener("click", (e) => { e.stopPropagation(); openReceipt(l); });

    // miniatura assinada (supabase) de forma assíncrona
    if (hasImg && !Store.isDemo()) {
      Store.receiptUrl(l).then(url => { if (url) thumbBtn.innerHTML = `<img src="${url}" alt="Comprovante">`; });
    }
    li.appendChild(item);
    return li;
  }

  function renderTxList(ul, list, emptyMsg, group) {
    ul.innerHTML = "";
    if (!list.length) {
      ul.innerHTML = `<li class="empty"><div class="empty-ico">🧾</div>${emptyMsg}</li>`;
      return;
    }
    if (!group) {
      list.forEach((l, i) => ul.appendChild(buildTxItem(l, i)));
      return;
    }
    // agrupado por dia
    let lastKey = null, idx = 0;
    list.forEach(l => {
      const key = HAIR.fmtData(l.data_movimento);
      if (key !== lastKey) {
        lastKey = key;
        const head = document.createElement("li");
        head.className = "tx-day";
        const dayIn = soma(list.filter(x => HAIR.fmtData(x.data_movimento) === key && x.tipo === "entrada"));
        const dayOut = soma(list.filter(x => HAIR.fmtData(x.data_movimento) === key && x.tipo === "saida"));
        head.innerHTML = `<span>${diaRotulo(l.data_movimento)}</span>
          <span class="tx-day-net">${HAIR.brl(dayIn - dayOut)}</span>`;
        ul.appendChild(head);
      }
      ul.appendChild(buildTxItem(l, idx++));
    });
  }

  function diaRotulo(iso) {
    const d = new Date(iso); const hoje = new Date(); const ont = new Date(); ont.setDate(hoje.getDate() - 1);
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, hoje)) return "Hoje";
    if (same(d, ont)) return "Ontem";
    return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  }

  /* Abre o comprovante em tela cheia com um toque */
  async function openReceipt(l) {
    if (!l.comprovante_url) return;
    const url = await Store.receiptUrl(l);
    if (!url) { toast("Comprovante indisponível.", "err"); return; }
    openViewer(url, Store.receiptIsPdf(l));
  }

  /* ===================== DETALHE ===================== */
  async function openDetalhe(l) {
    const body = $("#detalhe-body");
    const sinal = l.tipo === "entrada" ? "+" : "−";
    body.innerHTML = `
      <div class="det-head">
        <span class="det-badge ${l.tipo}">${l.tipo === "entrada" ? "Entrada" : "Saída"}</span>
        ${l.demo ? '<span class="demo-tag">DEMONSTRAÇÃO</span>' : ''}
      </div>
      <div class="det-value ${l.tipo}">${sinal} ${HAIR.brl(l.valor)}</div>
      <div class="det-rows">
        <div class="det-row"><span class="dk">Descrição</span><span class="dv">${escapeHtml(l.descricao || "—")}</span></div>
        <div class="det-row"><span class="dk">Conta</span><span class="dv">${HAIR.contaNome(l.conta)}</span></div>
        <div class="det-row"><span class="dk">Categoria</span><span class="dv"><span class="cat-pill" style="background:${HAIR.catCor(l.categoria)}1f;color:${HAIR.catCor(l.categoria)}">${HAIR.catIcone(l.categoria)} ${HAIR.catNome(l.categoria)}</span></span></div>
        <div class="det-row"><span class="dk">Forma de pagamento</span><span class="dv">${HAIR.formaNome(l.forma_pagamento)}</span></div>
        <div class="det-row"><span class="dk">Data e hora</span><span class="dv">${HAIR.fmtDataHora(l.data_movimento)}</span></div>
        <div class="det-row"><span class="dk">Responsável</span><span class="dv">${escapeHtml(l.responsavel || "—")}</span></div>
        ${l.observacao ? `<div class="det-row"><span class="dk">Observação</span><span class="dv">${escapeHtml(l.observacao)}</span></div>` : ""}
      </div>
      <div class="det-comprovante" id="det-comprovante"></div>
      <details class="det-history"><summary>Histórico de alterações</summary><div id="det-hist"></div></details>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="det-editar">Editar</button>
        <button class="btn btn-danger" id="det-excluir">Excluir</button>
      </div>`;
    openModal("#modal-detalhe");

    // comprovante
    const cEl = $("#det-comprovante");
    if (l.comprovante_url) {
      const url = await Store.receiptUrl(l);
      if (Store.receiptIsPdf(l)) {
        cEl.innerHTML = `<button class="pdf-open btn btn-ghost btn-block">📄 Abrir comprovante (PDF)</button>`;
        cEl.querySelector("button").onclick = () => openViewer(url, true);
      } else if (url) {
        cEl.innerHTML = `<div class="det-comp-label">📎 Comprovante — toque para ampliar</div><img src="${url}" alt="Comprovante">`;
        cEl.querySelector("img").onclick = () => openViewer(url, false);
      }
    } else {
      cEl.innerHTML = `<button class="btn btn-ghost btn-block det-add-comp">📷 Adicionar comprovante</button>`;
      cEl.querySelector("button").onclick = () => { closeModal("#modal-detalhe"); editLancamento(l); };
    }
    // histórico
    Store.listHistorico(l.id).then(hist => {
      const h = $("#det-hist");
      if (!h) return;
      h.innerHTML = hist.length
        ? hist.map(x => `<div class="hist-item">${escapeHtml(rotuloAcao(x.acao))} — ${HAIR.fmtDataHora(x.criado_em)}${x.ator ? " · " + escapeHtml(x.ator) : ""}</div>`).join("")
        : '<div class="hist-item">Sem alterações registradas.</div>';
    });

    $("#det-editar").onclick = () => { closeModal("#modal-detalhe"); editLancamento(l); };
    $("#det-excluir").onclick = () => confirmExcluir(l);
  }
  const rotuloAcao = (a) => ({ criacao: "Criado", edicao: "Editado", exclusao: "Excluído" }[a] || a);

  function confirmExcluir(l) {
    askConfirm("Excluir lançamento?", `“${l.descricao || "Lançamento"}” de ${HAIR.brl(l.valor)} será removido.`, async () => {
      try {
        await Store.deleteLancamento(l.id);
        closeModal("#modal-detalhe");
        await reload(); refreshCurrent();
        toast("Lançamento excluído.", "ok");
      } catch (e) { console.error(e); toast("Erro ao excluir.", "err"); }
    });
  }

  /* ===================== VIEWER TELA CHEIA ===================== */
  function openViewer(url, isPdf) {
    const c = $("#viewer-content");
    c.innerHTML = isPdf
      ? `<iframe src="${url}"></iframe>`
      : `<img src="${url}" alt="Comprovante">`;
    $("#viewer").hidden = false;
  }

  /* ===================== NOVO / EDITAR ===================== */
  function resetForm() {
    $("#lancamento-form").reset();
    $("#f-id").value = "";
    setTipo("entrada");
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    $("#f-data").value = now.toISOString().slice(0, 16);
    state.receiptFile = null; state.editingKeepReceipt = false;
    $("#comprovante-preview").hidden = true; $("#comprovante-preview").innerHTML = "";
    $("#lanc-error").hidden = true;
    $("#voice-status").hidden = true;
    $("#novo-title").textContent = "Novo lançamento";
    $("#lanc-submit").textContent = "Salvar lançamento";
    if (!Store.isDemo()) $("#f-responsavel").value = Store.currentUserLabel().split("@")[0] || "";
  }

  function editLancamento(l) {
    resetForm();
    $("#novo-title").textContent = "Editar lançamento";
    $("#lanc-submit").textContent = "Salvar alterações";
    $("#f-id").value = l.id;
    setTipo(l.tipo);
    $("#f-valor").value = HAIR.formatValorInput(l.valor);
    if (l.data_movimento) {
      const d = new Date(l.data_movimento); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      $("#f-data").value = d.toISOString().slice(0, 16);
    }
    $("#f-conta").value = l.conta || "";
    $("#f-categoria").value = l.categoria || "";
    $("#f-descricao").value = l.descricao || "";
    $("#f-forma").value = l.forma_pagamento || "";
    $("#f-responsavel").value = l.responsavel || "";
    $("#f-observacao").value = l.observacao || "";
    if (l.comprovante_url) {
      state.editingKeepReceipt = true;
      showReceiptPreview({ existing: true, nome: l.comprovante_nome || "Comprovante atual", isPdf: Store.receiptIsPdf(l), url: l.comprovante_url, lanc: l });
    }
    navTo("novo");
  }

  function setTipo(tipo) {
    $("#f-tipo").value = tipo;
    $("#tipo-entrada").classList.toggle("is-active", tipo === "entrada");
    $("#tipo-saida").classList.toggle("is-active", tipo === "saida");
  }

  async function showReceiptPreview({ file, existing, nome, isPdf, url, lanc }) {
    const box = $("#comprovante-preview");
    box.hidden = false;
    let thumb;
    if (file && file.type.startsWith("image/")) {
      thumb = `<img src="${URL.createObjectURL(file)}" alt="">`;
    } else if (existing && !isPdf) {
      const u = lanc ? await Store.receiptUrl(lanc) : url;
      thumb = u ? `<img src="${u}" alt="">` : `<span class="pdf-ico">🖼️</span>`;
    } else {
      thumb = `<span class="pdf-ico">📄</span>`;
    }
    box.innerHTML = `${thumb}
      <span class="cp-name">${escapeHtml(nome || (file && file.name) || "Comprovante")}</span>
      <button type="button" class="cp-remove">Remover</button>`;
    box.querySelector(".cp-remove").onclick = () => {
      state.receiptFile = null; state.editingKeepReceipt = false;
      box.hidden = true; box.innerHTML = "";
      $("#f-file-cam").value = ""; $("#f-file-lib").value = "";
    };
  }

  function onFilePicked(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toast("Arquivo muito grande (máx. 12 MB).", "err"); input.value = ""; return; }
    state.receiptFile = file; state.editingKeepReceipt = false;
    showReceiptPreview({ file, nome: file.name, isPdf: file.type === "application/pdf" });
  }

  async function submitLancamento(e) {
    e.preventDefault();
    const err = $("#lanc-error"); err.hidden = true;
    const valor = HAIR.parseValor($("#f-valor").value);
    const descricao = $("#f-descricao").value.trim();
    const conta = $("#f-conta").value;
    const categoria = $("#f-categoria").value;
    const dataLocal = $("#f-data").value;
    if (!valor || valor <= 0) return showFormErr("Informe um valor válido.");
    if (!descricao) return showFormErr("Informe a descrição.");
    if (!conta) return showFormErr("Selecione a conta.");
    if (!categoria) return showFormErr("Selecione a categoria.");
    if (!dataLocal) return showFormErr("Informe a data e hora.");

    const payload = {
      tipo: $("#f-tipo").value,
      valor,
      data_movimento: new Date(dataLocal).toISOString(),
      conta, categoria, descricao,
      forma_pagamento: $("#f-forma").value || null,
      responsavel: $("#f-responsavel").value.trim() || null,
      observacao: $("#f-observacao").value.trim() || null
    };

    const id = $("#f-id").value;
    const btn = $("#lanc-submit"); btn.disabled = true; btn.textContent = "Salvando...";
    try {
      if (id) await Store.updateLancamento(id, payload, state.receiptFile, state.editingKeepReceipt);
      else    await Store.createLancamento(payload, state.receiptFile);
      await reload();
      toast(id ? "Lançamento atualizado." : "Lançamento salvo.", "ok");
      resetForm();
      navTo(id ? "extrato" : "painel");
    } catch (e2) {
      console.error(e2); showFormErr("Erro ao salvar: " + (e2.message || "tente novamente."));
    } finally {
      btn.disabled = false;
      btn.textContent = id ? "Salvar alterações" : "Salvar lançamento";
    }
  }
  function showFormErr(msg) { const e = $("#lanc-error"); e.textContent = msg; e.hidden = false; e.scrollIntoView({ behavior: "smooth", block: "center" }); }

  /* ===================== VOZ ===================== */
  function startVoice() {
    if (!Voice.supported()) {
      voiceStatus("Seu navegador não suporta ditado por voz. Use o Chrome no Android ou preencha manualmente.", true);
      return;
    }
    const btn = $("#btn-voice");
    Voice.listen({
      onStart: () => { btn.classList.add("listening"); voiceStatus("🎙️ Ouvindo... fale o lançamento."); },
      onError: (m) => { btn.classList.remove("listening"); voiceStatus(m, true); },
      onResult: (txt, parsed) => {
        btn.classList.remove("listening");
        $("#voice-status").hidden = true;
        openVoiceConfirm(txt, parsed);
      }
    });
  }
  function voiceStatus(msg, isErr) {
    const s = $("#voice-status"); s.textContent = msg; s.hidden = false;
    s.classList.toggle("err", !!isErr);
  }

  function openVoiceConfirm(transcript, p) {
    state.voiceParsed = p;
    $("#voz-transcript").textContent = `“${transcript}”`;
    const linha = (k, v, ok) => `<div class="voz-field${ok ? "" : " missing"}"><span class="vk">${k}</span><span class="vv">${ok ? v : "não identificado"}</span></div>`;
    $("#voz-fields").innerHTML =
      linha("Tipo", p.tipo === "entrada" ? "Entrada" : "Saída", !!p.tipo) +
      linha("Valor", HAIR.brl(p.valor), !!p.valor) +
      linha("Conta", HAIR.contaNome(p.conta), !!p.conta) +
      linha("Categoria", HAIR.catNome(p.categoria), !!p.categoria) +
      linha("Descrição", p.descricao, !!p.descricao) +
      linha("Forma", HAIR.formaNome(p.forma_pagamento), !!p.forma_pagamento);
    openModal("#modal-voz");
  }

  function applyVoiceToForm() {
    const p = state.voiceParsed; if (!p) return;
    if (p.tipo) setTipo(p.tipo);
    if (p.valor) $("#f-valor").value = HAIR.formatValorInput(p.valor);
    if (p.conta) $("#f-conta").value = p.conta;
    if (p.categoria) $("#f-categoria").value = p.categoria;
    if (p.descricao) $("#f-descricao").value = p.descricao;
    if (p.forma_pagamento) $("#f-forma").value = p.forma_pagamento;
    if (p.observacao) $("#f-observacao").value = p.observacao;
    closeModal("#modal-voz");
    voiceStatus("Campos preenchidos por voz. Revise e toque em Salvar. ✅");
    $("#f-valor").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ===================== CONFIG SUPABASE ===================== */
  function openConfig() {
    const cfg = (() => { try { return JSON.parse(localStorage.getItem("hair_supabase_cfg") || "null"); } catch (_) { return null; } })();
    $("#cfg-url").value = (cfg && cfg.url) || HAIR.SUPABASE.url || "";
    $("#cfg-key").value = (cfg && cfg.anonKey) || HAIR.SUPABASE.anonKey || "";
    $("#cfg-error").hidden = true;
    openModal("#modal-config");
  }
  function saveConfig() {
    const url = $("#cfg-url").value.trim();
    const key = $("#cfg-key").value.trim();
    if (!/^https:\/\/.+\.supabase\.co/.test(url) || key.length < 20) {
      const e = $("#cfg-error"); e.textContent = "URL ou chave inválida."; e.hidden = false; return;
    }
    Store.saveCfg(url, key);
    toast("Supabase conectado. Faça login.", "ok");
    setTimeout(() => location.reload(), 800);
  }

  /* ===================== HELPERS UI ===================== */
  function openModal(sel) { $(sel).hidden = false; }
  function closeModal(sel) { $(sel).hidden = true; }
  function refreshCurrent() {
    const cur = $("#view-extrato").hidden ? "painel" : "extrato";
    if (cur === "painel") renderPainel(); else renderExtrato();
  }
  let toastT;
  function toast(msg, kind) {
    const t = $("#toast"); t.textContent = msg; t.className = "toast" + (kind ? " " + kind : "");
    t.hidden = false; clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }
  let confirmCb = null;
  function askConfirm(title, msg, cb) {
    $("#confirm-title").textContent = title;
    $("#confirm-msg").textContent = msg;
    confirmCb = cb; openModal("#modal-confirm");
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ===================== EVENTOS GLOBAIS ===================== */
  function bindGlobal() {
    // login
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#login-error"); err.hidden = true;
      const btn = $("#login-submit"); btn.disabled = true; btn.textContent = "Entrando...";
      try {
        await Store.signIn($("#login-email").value.trim(), $("#login-password").value);
        startApp();
      } catch (e2) {
        err.textContent = "E-mail ou senha inválidos."; err.hidden = false;
      } finally { btn.disabled = false; btn.textContent = "Entrar"; }
    });
    $("#btn-demo").addEventListener("click", () => { Store.enterDemo(); startApp(); });
    $("#btn-logout").addEventListener("click", () => {
      askConfirm("Sair da conta?", "Você voltará para a tela de login.", async () => {
        closeModal("#modal-confirm");
        await Store.signOut();
        location.reload();
      });
    });

    // navegação
    $$("[data-nav]").forEach(b => b.addEventListener("click", () => navTo(b.dataset.nav)));
    $("#fab-novo").addEventListener("click", () => { resetForm(); navTo("novo"); });

    // período
    $$("#period-tabs .chip").forEach(c => c.addEventListener("click", () => {
      $$("#period-tabs .chip").forEach(x => x.classList.remove("is-active"));
      c.classList.add("is-active");
      state.period = c.dataset.period;
      $("#custom-range").hidden = state.period !== "custom";
      renderPainel();
    }));
    $("#range-start").addEventListener("change", (e) => { state.range.start = e.target.value; renderPainel(); });
    $("#range-end").addEventListener("change", (e) => { state.range.end = e.target.value; renderPainel(); });

    // tipo toggle
    $("#tipo-entrada").addEventListener("click", () => setTipo("entrada"));
    $("#tipo-saida").addEventListener("click", () => setTipo("saida"));

    // máscara de valor (centavos)
    $("#f-valor").addEventListener("input", (e) => { e.target.value = HAIR.maskCentavos(e.target.value); });

    // upload
    $("#f-file-cam").addEventListener("change", (e) => onFilePicked(e.target));
    $("#f-file-lib").addEventListener("change", (e) => onFilePicked(e.target));

    // form
    $("#lancamento-form").addEventListener("submit", submitLancamento);

    // voz
    $("#btn-voice").addEventListener("click", startVoice);
    $("#voz-cancelar").addEventListener("click", () => closeModal("#modal-voz"));
    $("#voz-usar").addEventListener("click", applyVoiceToForm);

    // extrato filtros
    $("#btn-toggle-filters").addEventListener("click", () => {
      const f = $("#extrato-filters"); f.hidden = !f.hidden;
    });
    const bindFilter = (sel, key) => $(sel).addEventListener("change", (e) => { state.filters[key] = e.target.value; renderExtrato(); });
    bindFilter("#filt-conta", "conta");
    bindFilter("#filt-tipo", "tipo");
    bindFilter("#filt-categoria", "categoria");
    bindFilter("#filt-responsavel", "responsavel");
    bindFilter("#filt-start", "start");
    bindFilter("#filt-end", "end");
    // busca
    let searchT;
    $("#extrato-search").addEventListener("input", (e) => {
      clearTimeout(searchT);
      const v = e.target.value;
      searchT = setTimeout(() => { state.filters.q = v; renderExtrato(); }, 200);
    });

    $("#filt-clear").addEventListener("click", () => {
      state.filters = { conta: "", tipo: "", categoria: "", responsavel: "", start: "", end: "", q: "" };
      syncFilterInputs();
      renderExtrato();
    });

    // viewer
    $("#viewer-close").addEventListener("click", () => { $("#viewer").hidden = true; $("#viewer-content").innerHTML = ""; });

    // config
    $("#demo-config").addEventListener("click", openConfig);
    $("#cfg-cancelar").addEventListener("click", () => closeModal("#modal-config"));
    $("#cfg-salvar").addEventListener("click", saveConfig);

    // confirm modal
    $("#confirm-no").addEventListener("click", () => closeModal("#modal-confirm"));
    $("#confirm-yes").addEventListener("click", () => { if (confirmCb) confirmCb(); });

    // fechar modais tocando no fundo
    $$(".modal").forEach(m => m.addEventListener("click", (e) => { if (e.target === m) m.hidden = true; }));
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
