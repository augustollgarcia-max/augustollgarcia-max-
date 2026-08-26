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
  { id: "matricula",   nome: "Matrícula" },
  { id: "mensalidade", nome: "Mensalidade" },
  { id: "curso",       nome: "Curso / Workshop" },
  { id: "produto",     nome: "Produto" },
  { id: "servico",     nome: "Serviço" },
  { id: "comissao",    nome: "Comissão" },
  { id: "aluguel",     nome: "Aluguel" },
  { id: "equipe",      nome: "Equipe / Professor" },
  { id: "material",    nome: "Material" },
  { id: "marketing",   nome: "Marketing" },
  { id: "outros",      nome: "Outros" }
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
