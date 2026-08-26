/* ===========================================================
   Store — camada de dados (Supabase OU modo demonstração local)
   =========================================================== */
(function () {
  const LS_CFG   = "hair_supabase_cfg";
  const LS_LANC  = "hair_demo_lancamentos";
  const LS_HIST  = "hair_demo_historico";
  const LS_SEED  = "hair_demo_seeded";

  const Store = {
    mode: "demo",         // "supabase" | "demo"
    sb: null,             // cliente supabase
    user: null,
    BUCKET: "comprovantes"
  };

  /* ---------- Configuração do Supabase ---------- */
  function readCfg() {
    let cfg = { url: HAIR.SUPABASE.url, anonKey: HAIR.SUPABASE.anonKey };
    try {
      const saved = JSON.parse(localStorage.getItem(LS_CFG) || "null");
      if (saved && saved.url && saved.anonKey) cfg = saved;
    } catch (_) {}
    return cfg;
  }
  Store.saveCfg = function (url, anonKey) {
    localStorage.setItem(LS_CFG, JSON.stringify({ url, anonKey }));
  };
  Store.clearCfg = function () { localStorage.removeItem(LS_CFG); };

  /* ---------- Inicialização ---------- */
  Store.init = async function () {
    const cfg = readCfg();
    const hasSb = cfg.url && cfg.anonKey && window.supabase && window.supabase.createClient;
    if (hasSb) {
      try {
        Store.sb = window.supabase.createClient(cfg.url, cfg.anonKey);
        Store.mode = "supabase";
        const { data } = await Store.sb.auth.getSession();
        Store.user = data && data.session ? data.session.user : null;
        return;
      } catch (e) {
        console.warn("Falha ao iniciar Supabase, usando modo demo:", e);
      }
    }
    Store.mode = "demo";
  };

  Store.isDemo = () => Store.mode === "demo";

  /* ---------- Autenticação ---------- */
  Store.signIn = async function (email, password) {
    if (Store.mode !== "supabase") throw new Error("Supabase não configurado.");
    const { data, error } = await Store.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    Store.user = data.user;
    return data.user;
  };
  Store.signOut = async function () {
    if (Store.mode === "supabase" && Store.sb) await Store.sb.auth.signOut();
    Store.user = null;
  };
  Store.enterDemo = function () {
    Store.mode = "demo";
    Store.user = { email: "demonstracao@hair", id: "demo" };
    Store.seedDemo();
  };
  Store.currentUserLabel = function () {
    if (!Store.user) return "";
    return Store.user.email || "Usuário";
  };

  /* ===========================================================
     LANÇAMENTOS
     =========================================================== */
  const COLS = "id,created_at,data_movimento,tipo,conta,categoria,descricao,forma_pagamento,responsavel,valor,observacao,comprovante_url,comprovante_nome,criado_por,demo";

  Store.listLancamentos = async function () {
    if (Store.mode === "supabase") {
      const { data, error } = await Store.sb
        .from("lancamentos").select(COLS)
        .order("data_movimento", { ascending: false });
      if (error) throw error;
      return data || [];
    }
    return demoRead().sort((a, b) => new Date(b.data_movimento) - new Date(a.data_movimento));
  };

  Store.createLancamento = async function (payload, file) {
    if (Store.mode === "supabase") {
      let comprovante_url = null, comprovante_nome = null;
      if (file) {
        const up = await uploadFile(file);
        comprovante_url = up.path; comprovante_nome = up.name;
      }
      const row = { ...payload, comprovante_url, comprovante_nome, criado_por: Store.user ? Store.user.id : null, demo: false };
      const { data, error } = await Store.sb.from("lancamentos").insert(row).select(COLS).single();
      if (error) throw error;
      return data;
    }
    // demo
    const list = demoRead();
    const row = {
      ...payload,
      id: "d_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      created_at: new Date().toISOString(),
      criado_por: "demo",
      demo: true
    };
    if (file) {
      const asData = await fileToDataURL(file);
      row.comprovante_url = asData;
      row.comprovante_nome = file.name;
    }
    list.push(row);
    demoWrite(list);
    demoLog("criacao", row.id, "Lançamento criado");
    return row;
  };

  Store.updateLancamento = async function (id, payload, file, keepReceipt) {
    if (Store.mode === "supabase") {
      const patch = { ...payload };
      if (file) {
        const up = await uploadFile(file);
        patch.comprovante_url = up.path; patch.comprovante_nome = up.name;
      } else if (!keepReceipt) {
        patch.comprovante_url = null; patch.comprovante_nome = null;
      }
      const { data, error } = await Store.sb.from("lancamentos").update(patch).eq("id", id).select(COLS).single();
      if (error) throw error;
      return data;
    }
    const list = demoRead();
    const i = list.findIndex(r => r.id === id);
    if (i < 0) throw new Error("Lançamento não encontrado.");
    const merged = { ...list[i], ...payload };
    if (file) { merged.comprovante_url = await fileToDataURL(file); merged.comprovante_nome = file.name; }
    else if (!keepReceipt) { merged.comprovante_url = null; merged.comprovante_nome = null; }
    list[i] = merged;
    demoWrite(list);
    demoLog("edicao", id, "Lançamento editado");
    return merged;
  };

  Store.deleteLancamento = async function (id) {
    if (Store.mode === "supabase") {
      const { error } = await Store.sb.from("lancamentos").delete().eq("id", id);
      if (error) throw error;
      return;
    }
    const list = demoRead();
    demoWrite(list.filter(r => r.id !== id));
    demoLog("exclusao", id, "Lançamento excluído");
  };

  /* ---------- Histórico de alterações ---------- */
  Store.listHistorico = async function (id) {
    if (Store.mode === "supabase") {
      const { data, error } = await Store.sb
        .from("lancamentos_historico").select("acao,detalhe,criado_em,ator")
        .eq("lancamento_id", id).order("criado_em", { ascending: false });
      if (error) { console.warn(error); return []; }
      return data || [];
    }
    try {
      const all = JSON.parse(localStorage.getItem(LS_HIST) || "[]");
      return all.filter(h => h.lancamento_id === id).reverse();
    } catch (_) { return []; }
  };

  /* ===========================================================
     COMPROVANTES
     =========================================================== */
  async function uploadFile(file) {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const uid = Store.user ? Store.user.id : "anon";
    const path = `${uid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await Store.sb.storage.from(Store.BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return { path, name: file.name };
  }

  /* Retorna URL exibível do comprovante (assinada no Supabase, data URL no demo) */
  Store.receiptUrl = async function (lanc) {
    if (!lanc || !lanc.comprovante_url) return null;
    if (Store.mode !== "supabase") return lanc.comprovante_url; // já é data URL
    const { data, error } = await Store.sb.storage.from(Store.BUCKET)
      .createSignedUrl(lanc.comprovante_url, 3600);
    if (error) { console.warn(error); return null; }
    return data.signedUrl;
  };

  Store.receiptIsPdf = function (lanc) {
    if (!lanc || !lanc.comprovante_url) return false;
    const n = (lanc.comprovante_nome || lanc.comprovante_url || "").toLowerCase();
    return n.includes(".pdf") || n.startsWith("data:application/pdf");
  };

  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  /* ===========================================================
     MODO DEMONSTRAÇÃO — armazenamento local
     =========================================================== */
  function demoRead() {
    try { return JSON.parse(localStorage.getItem(LS_LANC) || "[]"); }
    catch (_) { return []; }
  }
  function demoWrite(list) { localStorage.setItem(LS_LANC, JSON.stringify(list)); }
  function demoLog(acao, lancamento_id, detalhe) {
    try {
      const all = JSON.parse(localStorage.getItem(LS_HIST) || "[]");
      all.push({ lancamento_id, acao, detalhe, ator: "demonstração", criado_em: new Date().toISOString() });
      localStorage.setItem(LS_HIST, JSON.stringify(all));
    } catch (_) {}
  }

  Store.seedDemo = function () {
    if (localStorage.getItem(LS_SEED) === "1" && demoRead().length) return;
    const now = new Date();
    const d = (daysAgo, h, m) => {
      const x = new Date(now); x.setDate(x.getDate() - daysAgo); x.setHours(h, m, 0, 0);
      return x.toISOString();
    };
    const mk = (o) => ({
      id: "seed_" + Math.random().toString(36).slice(2, 9),
      created_at: new Date().toISOString(),
      responsavel: o.responsavel || "Recepção",
      observacao: o.observacao || "",
      comprovante_url: null, comprovante_nome: null,
      criado_por: "demo", demo: true, ...o
    });
    const seed = [
      mk({ data_movimento: d(0, 9, 15),  tipo: "entrada", conta: "dinheiro_pix", categoria: "matricula",   descricao: "[DEMO] Matrícula do Wesley",         forma_pagamento: "pix",      valor: 600 }),
      mk({ data_movimento: d(0, 11, 0),  tipo: "entrada", conta: "asaas",        categoria: "mensalidade",  descricao: "[DEMO] Mensalidade turma noite",    forma_pagamento: "cartao",   valor: 350 }),
      mk({ data_movimento: d(1, 14, 30), tipo: "saida",   conta: "dinheiro_pix", categoria: "material",     descricao: "[DEMO] Compra de material",         forma_pagamento: "dinheiro", valor: 180 }),
      mk({ data_movimento: d(2, 10, 0),  tipo: "entrada", conta: "pagseguro",    categoria: "curso",        descricao: "[DEMO] Workshop de coloração",      forma_pagamento: "cartao",   valor: 890 }),
      mk({ data_movimento: d(3, 16, 45), tipo: "saida",   conta: "asaas",        categoria: "equipe",       descricao: "[DEMO] Comissão professora Ana",    forma_pagamento: "transferencia", valor: 420, responsavel: "Financeiro" }),
      mk({ data_movimento: d(5, 9, 0),   tipo: "saida",   conta: "infinity",     categoria: "aluguel",      descricao: "[DEMO] Aluguel do espaço",          forma_pagamento: "boleto",   valor: 2500, responsavel: "Financeiro" }),
      mk({ data_movimento: d(6, 13, 20), tipo: "entrada", conta: "infinity",     categoria: "produto",      descricao: "[DEMO] Venda de kit profissional",  forma_pagamento: "pix",      valor: 260 }),
      mk({ data_movimento: d(9, 15, 0),  tipo: "entrada", conta: "pagseguro",    categoria: "servico",      descricao: "[DEMO] Serviço de escova modelo",   forma_pagamento: "cartao",   valor: 120 }),
      mk({ data_movimento: d(12, 10, 30),tipo: "saida",   conta: "dinheiro_pix", categoria: "marketing",    descricao: "[DEMO] Impulsionamento Instagram",  forma_pagamento: "cartao",   valor: 150 }),
      mk({ data_movimento: d(20, 11, 0), tipo: "entrada", conta: "asaas",        categoria: "matricula",    descricao: "[DEMO] Matrícula da Bruna",         forma_pagamento: "pix",      valor: 600 })
    ];
    demoWrite(seed);
    localStorage.setItem(LS_SEED, "1");
  };

  window.Store = Store;
})();
