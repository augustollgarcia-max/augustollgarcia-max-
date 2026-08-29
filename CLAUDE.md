# CLAUDE.md — HAIR Financeiro

Memória do projeto para o Claude Code. Ler antes de qualquer tarefa de publicação.

## Publicação / Deploy (IMPORTANTE)
- Este repositório é **apenas o app financeiro** (novo). Publicar **SOMENTE pelo GitHub Pages** (branch `main`, pasta raiz `/`).
- **NÃO usar Netlify.** **NÃO usar Vercel** para este app. (Decisão do usuário — 2026.)
- URL do app: https://augustollgarcia-max.github.io/augustollgarcia-max-/
- Como ativar (uma vez): repositório → Settings → Pages → Source: “Deploy from a branch” → Branch `main` /(root) → Save.

## NÃO TOCAR — site da escola (separado)
- O **site da escola/curso** (HAIR) é OUTRO projeto, fica hospedado no **Vercel** e está **funcionando corretamente**.
- **Nunca** mexer, republicar ou alterar o site da escola nem o projeto dele no Vercel.
- A regra “não usar Vercel” acima vale só para o app financeiro; ela **não** significa remover ou tocar no site da escola que já está no Vercel.

## Sobre o app
- PWA mobile-first de controle financeiro (entradas/saídas) da HAIR Academia da Beleza.
- Site estático, sem etapa de build. Front em HTML/CSS/JS puro + Supabase (opcional) via CDN.
- Estrutura: `index.html`, `css/styles.css`, `js/` (config, store, voice, pin, app), `icons/`, `sw.js`, `manifest.webmanifest`, `supabase/schema.sql`.
- Modo demonstração local (dados marcados como `[DEMO]`) roda sem configurar nada.
- Para produção real: rodar `supabase/schema.sql` no Supabase e conectar URL + anon key pelo app.
