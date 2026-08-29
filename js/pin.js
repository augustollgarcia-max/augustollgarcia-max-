/* ===========================================================
   PIN — trava rápida do app (4 dígitos) + biometria opcional
   O PIN fica guardado apenas neste aparelho (hash + salt).
   =========================================================== */
(function () {
  const LS_PIN = "hair_pin";       // {salt, hash}
  const LS_BIO = "hair_pin_bio";   // id base64 da credencial biométrica
  const Pin = { onLogout: null };

  Pin.init = function ({ onLogout } = {}) { Pin.onLogout = onLogout; buildDom(); };
  Pin.enabled = () => !!localStorage.getItem(LS_PIN);
  Pin.bioEnabled = () => !!localStorage.getItem(LS_BIO);

  /* ---------- Hash ---------- */
  async function sha256(txt) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    // fallback simples (contexto inseguro): djb2
    let h = 5381; for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) >>> 0;
    return "x" + h.toString(16);
  }
  function rndSalt() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

  Pin.setPin = async function (pin) {
    const salt = rndSalt();
    const hash = await sha256(salt + pin);
    localStorage.setItem(LS_PIN, JSON.stringify({ salt, hash }));
  };
  Pin.verify = async function (pin) {
    try {
      const { salt, hash } = JSON.parse(localStorage.getItem(LS_PIN) || "{}");
      if (!salt) return false;
      return (await sha256(salt + pin)) === hash;
    } catch (_) { return false; }
  };
  Pin.clear = function () { localStorage.removeItem(LS_PIN); localStorage.removeItem(LS_BIO); };

  /* ---------- Biometria (WebAuthn, melhor esforço, local) ---------- */
  Pin.bioSupported = async function () {
    try {
      return !!(window.PublicKeyCredential &&
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch (_) { return false; }
  };
  function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function fromB64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

  Pin.bioRegister = async function () {
    if (!(await Pin.bioSupported())) throw new Error("Biometria indisponível.");
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "HAIR Financeiro", id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "hair", displayName: "HAIR" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000
      }
    });
    localStorage.setItem(LS_BIO, b64(cred.rawId));
  };
  Pin.bioUnlock = async function () {
    const id = localStorage.getItem(LS_BIO);
    if (!id) return false;
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: "public-key", id: fromB64(id) }],
          userVerification: "required", timeout: 60000
        }
      });
      return true;
    } catch (_) { return false; }
  };

  /* ===========================================================
     TECLADO (DOM injetado)
     =========================================================== */
  let el, dotsEl, titleEl, subEl, errEl, bioBtn, logoutBtn, current = "", handler = null, allowBio = false;

  function buildDom() {
    if (document.getElementById("pin-lock")) return;
    el = document.createElement("div");
    el.id = "pin-lock"; el.className = "pin-lock"; el.hidden = true;
    el.innerHTML = `
      <div class="pin-brand">HAIR</div>
      <div class="pin-title" id="pin-title">Digite seu PIN</div>
      <div class="pin-sub" id="pin-sub"></div>
      <div class="pin-dots" id="pin-dots"></div>
      <div class="pin-error" id="pin-error"></div>
      <div class="pin-pad" id="pin-pad"></div>
      <button class="pin-logout" id="pin-logout" type="button" hidden>Sair da conta</button>`;
    document.body.appendChild(el);
    dotsEl = el.querySelector("#pin-dots");
    titleEl = el.querySelector("#pin-title");
    subEl = el.querySelector("#pin-sub");
    errEl = el.querySelector("#pin-error");
    logoutBtn = el.querySelector("#pin-logout");
    logoutBtn.addEventListener("click", () => Pin.onLogout && Pin.onLogout());

    const pad = el.querySelector("#pin-pad");
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "back"];
    keys.forEach(k => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "pin-key";
      if (k === "bio") { b.id = "pin-bio"; b.className += " pin-key-fn"; b.innerHTML = "☝︎"; b.title = "Biometria"; bioBtn = b; }
      else if (k === "back") { b.className += " pin-key-fn"; b.innerHTML = "⌫"; }
      else b.textContent = k;
      b.addEventListener("click", () => onKey(k));
      pad.appendChild(b);
    });
  }

  function renderDots() {
    dotsEl.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const d = document.createElement("span");
      d.className = "pin-dot" + (i < current.length ? " on" : "");
      dotsEl.appendChild(d);
    }
  }
  function shake() { dotsEl.classList.remove("shake"); void dotsEl.offsetWidth; dotsEl.classList.add("shake"); }

  function onKey(k) {
    if (k === "bio") { if (allowBio) tryBio(); return; }
    if (k === "back") { current = current.slice(0, -1); renderDots(); return; }
    if (current.length >= 4) return;
    current += k; renderDots();
    if (current.length === 4) setTimeout(() => handler && handler(current), 120);
  }

  async function tryBio() {
    errEl.textContent = "";
    const ok = await Pin.bioUnlock();
    if (ok) { hide(); if (Pin._resolveUnlock) { Pin._resolveUnlock(); Pin._resolveUnlock = null; } }
    else errEl.textContent = "Não reconhecido. Use o PIN.";
  }

  function show({ title, sub, showLogout, withBio }) {
    current = ""; renderDots(); errEl.textContent = "";
    titleEl.textContent = title;
    subEl.textContent = sub || "";
    subEl.hidden = !sub;
    logoutBtn.hidden = !showLogout;
    allowBio = !!withBio && Pin.bioEnabled();
    if (bioBtn) bioBtn.style.visibility = allowBio ? "visible" : "hidden";
    el.hidden = false;
  }
  function hide() { el.hidden = true; handler = null; current = ""; }

  /* Coleta 1 PIN (promise). cancelable via botão? usado internamente */
  function collect({ title, sub, withBio }) {
    return new Promise((resolve) => {
      show({ title, sub, showLogout: false, withBio });
      handler = (pin) => resolve(pin);
    });
  }

  /* ===========================================================
     FLUXOS PÚBLICOS
     =========================================================== */
  /* Bloqueia a abertura do app até desbloquear */
  Pin.gate = function (onUnlock) {
    if (!Pin.enabled()) { onUnlock(); return; }
    Pin._resolveUnlock = () => onUnlock();
    show({ title: "Digite seu PIN", showLogout: true, withBio: true });
    handler = async (pin) => {
      if (await Pin.verify(pin)) { hide(); const r = Pin._resolveUnlock; Pin._resolveUnlock = null; r && r(); }
      else { shake(); errEl.textContent = "PIN incorreto."; current = ""; renderDots(); }
    };
    // tenta biometria automaticamente
    if (Pin.bioEnabled()) setTimeout(tryBio, 300);
  };

  /* Cria/confirma um novo PIN (promise -> true/false) */
  Pin.createFlow = async function () {
    const p1 = await collect({ title: "Crie um PIN", sub: "4 dígitos para abrir o app" });
    const p2 = await collect({ title: "Confirme o PIN", sub: "Digite novamente" });
    if (p1 !== p2) { shake(); errEl.textContent = "Os PINs não conferem."; await wait(900); hide(); return false; }
    await Pin.setPin(p1);
    hide();
    return true;
  };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  window.Pin = Pin;
})();
