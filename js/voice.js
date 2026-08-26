/* ===========================================================
   Voz — reconhecimento (Web Speech API) + interpretação PT-BR
   O resultado SEMPRE passa por confirmação visual antes de salvar.
   =========================================================== */
(function () {
  const Voice = {};

  Voice.supported = () =>
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  Voice.listen = function ({ onStart, onResult, onError } = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { onError && onError("Reconhecimento de voz não suportado neste navegador."); return null; }
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onstart = () => onStart && onStart();
    rec.onerror = (e) => onError && onError(traduzErro(e.error));
    rec.onresult = (e) => {
      const txt = e.results[0][0].transcript;
      onResult && onResult(txt, Voice.parse(txt));
    };
    try { rec.start(); } catch (e) { onError && onError("Não foi possível iniciar o microfone."); }
    return rec;
  };

  function traduzErro(code) {
    const map = {
      "not-allowed": "Permissão de microfone negada.",
      "service-not-allowed": "Permissão de microfone negada.",
      "no-speech": "Não ouvi nada. Tente novamente.",
      "audio-capture": "Microfone não encontrado.",
      "network": "Erro de rede no reconhecimento de voz."
    };
    return map[code] || "Erro no reconhecimento de voz.";
  }

  /* ---------- Números por extenso (casos comuns) ---------- */
  const NUM_WORDS = {
    "zero":0,"um":1,"uma":1,"dois":2,"duas":2,"tres":3,"três":3,"quatro":4,"cinco":5,
    "seis":6,"sete":7,"oito":8,"nove":9,"dez":10,"onze":11,"doze":12,"treze":13,
    "quatorze":14,"catorze":14,"quinze":15,"dezesseis":16,"dezessete":17,"dezoito":18,
    "dezenove":19,"vinte":20,"trinta":30,"quarenta":40,"cinquenta":50,"sessenta":60,
    "setenta":70,"oitenta":80,"noventa":90,"cem":100,"cento":100,"duzentos":200,
    "trezentos":300,"quatrocentos":400,"quinhentos":500,"seiscentos":600,"setecentos":700,
    "oitocentos":800,"novecentos":900,"mil":1000
  };

  function palavrasParaNumero(tokens) {
    // interpreta sequência simples: "mil e duzentos", "seiscentos", "dois mil"
    let total = 0, atual = 0, achou = false;
    for (const t of tokens) {
      if (t === "e") continue;
      if (!(t in NUM_WORDS)) break;
      achou = true;
      const v = NUM_WORDS[t];
      if (v === 1000) { atual = (atual || 1) * 1000; total += atual; atual = 0; }
      else { atual += v; }
    }
    total += atual;
    return achou ? total : null;
  }

  /* ---------- Interpretação principal ---------- */
  Voice.parse = function (raw) {
    const texto = " " + raw.toLowerCase().replace(/[.!?]/g, " ").replace(/\s+/g, " ") + " ";
    const out = { transcript: raw };

    // TIPO
    if (/\b(entrou|entrada|recebi|recebemos|recebido|entraram|ganhei|caiu)\b/.test(texto)) out.tipo = "entrada";
    else if (/\b(saiu|saída|saida|paguei|pagamos|gastei|gasto|despesa|comprei|compra|saíram)\b/.test(texto)) out.tipo = "saida";

    // VALOR — dígitos primeiro (milhar com ponto OU inteiro simples, decimal com vírgula)
    let valor = null;
    const mNum = texto.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(reais|real|r\$|conto|pila)?/);
    if (mNum) valor = HAIR.parseValor(mNum[1]);
    if (valor == null || valor === 0) {
      // tenta por extenso: pega a sequência final de palavras-número antes de "reais"
      const idx = texto.indexOf(" reais");
      if (idx > -1) {
        const antes = texto.slice(0, idx).trim().split(" ");
        const run = [];
        for (let i = antes.length - 1; i >= 0; i--) {
          const t = antes[i];
          if (t === "e" || t in NUM_WORDS) run.unshift(t); else break;
        }
        const v = palavrasParaNumero(run);
        if (v) valor = v;
      }
    }
    if (valor != null && valor > 0) out.valor = valor;

    // CONTA
    if (/\bpix\b/.test(texto) || /\bdinheiro\b/.test(texto) || /esp[eé]cie/.test(texto)) out.conta = "dinheiro_pix";
    if (/\basaas\b|\basas\b|\bazaz\b/.test(texto)) out.conta = "asaas";
    if (/\bpag\s?seguro\b|\bpagbank\b|\bpag\s?bank\b/.test(texto)) out.conta = "pagseguro";
    if (/\binfinity\b|\binfinit\b|\binfiniti\b/.test(texto)) out.conta = "infinity";

    // FORMA DE PAGAMENTO
    if (/\bpix\b/.test(texto)) out.forma_pagamento = "pix";
    else if (/\bdinheiro\b|esp[eé]cie/.test(texto)) out.forma_pagamento = "dinheiro";
    else if (/\bcart[aã]o\b|cr[eé]dito|d[eé]bito/.test(texto)) out.forma_pagamento = "cartao";
    else if (/\bboleto\b/.test(texto)) out.forma_pagamento = "boleto";
    else if (/transfer[eê]ncia|ted\b|doc\b/.test(texto)) out.forma_pagamento = "transferencia";

    // CATEGORIA
    const catMap = [
      ["matricula", /matr[ií]cula/],
      ["mensalidade", /mensalidade|parcela/],
      ["curso", /curso|workshop|oficina|aula/],
      ["produto", /produto|kit|venda de/],
      ["servico", /servi[çc]o|escova|corte|penteado|maquiagem/],
      ["comissao", /comiss[aã]o/],
      ["aluguel", /aluguel/],
      ["equipe", /professor|professora|equipe|funcion[aá]ri/],
      ["material", /material|insumo/],
      ["marketing", /marketing|an[uú]ncio|impulsion|tr[aá]fego|instagram|ads/],
      ["outros", /\boutros?\b/]
    ];
    for (const [id, re] of catMap) { if (re.test(texto)) { out.categoria = id; break; } }

    // DESCRIÇÃO — tenta capturar nome próprio após "do/da/de"
    let nome = null;
    const mNome = raw.match(/\b(?:do|da|de)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚ][a-záàâãéêíóôõúç]+(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚ][a-záàâãéêíóôõúç]+)?)/);
    if (mNome) nome = mNome[1];
    const partes = [];
    if (out.categoria) partes.push(HAIR.catNome(out.categoria));
    if (nome) partes.push((partes.length ? "— " : "") + nome);
    if (partes.length) out.descricao = partes.join(" ");
    else out.descricao = raw.charAt(0).toUpperCase() + raw.slice(1);

    // OBSERVAÇÃO (comprovante mencionado)
    if (/comprovante|anexad/.test(texto)) out.observacao = "Comprovante mencionado por voz.";

    return out;
  };

  window.Voice = Voice;
})();
