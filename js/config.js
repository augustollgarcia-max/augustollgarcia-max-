/* ===========================================================
   Configuração e constantes — HAIR Financeiro
   =========================================================== */
window.HAIR = window.HAIR || {};

/* Preencha aqui para embutir o Supabase no deploy (ou configure pelo app).
   Deixe vazio para iniciar em modo demonstração. */
HAIR.SUPABASE = {
  url: "",       // ex.: https://xxxxxxxx.supabase.co
  anonKey: ""    // chave pública (anon)
};

/* Contas financeiras (ordem exibida). id = valor salvo no banco. */
HAIR.CONTAS = [
  { id: "asaas",       nome: "Asaas",         cor: "#635BFF" },
  { id: "pagseguro",   nome: "PagSeguro",     cor: "#F5A623" },
  { id: "infinity",    nome: "Infinity",      cor: "#7B61FF" },
  { id: "dinheiro_pix",nome: "Dinheiro / Pix",cor: "#12B76A" }
];

HAIR.CATEGORIAS = [
  { id: "matricula",   nome: "Matrícula",           icone: "🎓", cor: "#6C5CE7" },
  { id: "mensalidade", nome: "Mensalidade",         icone: "🗓️", cor: "#0984E3" },
  { id: "curso",       nome: "Curso / Workshop",    icone: "💈", cor: "#00B894" },
  { id: "produto",     nome: "Produto",             icone: "🛍️", cor: "#E17055" },
  { id: "servico",     nome: "Serviço",             icone: "✂️", cor: "#E84393" },
  { id: "comissao",    nome: "Comissão",            icone: "🤝", cor: "#B8860B" },
  { id: "aluguel",     nome: "Aluguel",             icone: "🏠", cor: "#636E72" },
  { id: "equipe",      nome: "Equipe / Professor",  icone: "👩‍🏫", cor: "#0097A7" },
  { id: "material",    nome: "Material",            icone: "📦", cor: "#8E7CC3" },
  { id: "marketing",   nome: "Marketing",           icone: "📣", cor: "#E84118" },
  { id: "outros",      nome: "Outros",              icone: "🔖", cor: "#7A8794" }
];

HAIR.FORMAS = [
  { id: "pix",           nome: "Pix" },
  { id: "dinheiro",      nome: "Dinheiro" },
  { id: "cartao",        nome: "Cartão" },
  { id: "boleto",        nome: "Boleto" },
  { id: "transferencia", nome: "Transferência" },
  { id: "outro",         nome: "Outro" }
];

/* Helpers de exibição ---------------------------------------------------- */
HAIR.contaNome = (id) => (HAIR.CONTAS.find(c => c.id === id) || {}).nome || id || "—";
HAIR.contaCor  = (id) => (HAIR.CONTAS.find(c => c.id === id) || {}).cor  || "#C9A227";
HAIR.catNome   = (id) => (HAIR.CATEGORIAS.find(c => c.id === id) || {}).nome || id || "—";
HAIR.catIcone  = (id) => (HAIR.CATEGORIAS.find(c => c.id === id) || {}).icone || "🔖";
HAIR.catCor    = (id) => (HAIR.CATEGORIAS.find(c => c.id === id) || {}).cor || "#7A8794";
HAIR.formaNome = (id) => (HAIR.FORMAS.find(c => c.id === id) || {}).nome || id || "—";

/* Formatação BRL e datas ------------------------------------------------- */
HAIR.brl = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

HAIR.fmtData = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("pt-BR");
};
HAIR.fmtDataHora = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("pt-BR") + " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

/* Converte "1.234,56" ou "1234.56" -> Number */
HAIR.parseValor = (str) => {
  if (typeof str === "number") return str;
  if (!str) return 0;
  let s = String(str).replace(/[^\d.,-]/g, "").trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return Math.round((parseFloat(s) || 0) * 100) / 100;
};
