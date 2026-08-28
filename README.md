# HAIR Financeiro — Academia da Beleza 💇‍♀️💰

Aplicativo **financeiro mobile-first (PWA)** para controlar **entradas e saídas**
da HAIR Academia da Beleza de forma simples, visual e segura — direto do celular.

- 📱 **PWA instalável** (funciona como app no Android/iOS)
- 🎨 Design premium: **azul-marinho + dourado**, verde para entradas, vermelho para saídas
- 🎤 **Lançamento por voz** (fala → interpreta → **confirmação visual** antes de salvar)
- 📎 **Comprovantes** por câmera, galeria ou PDF (miniatura + tela cheia)
- 🔒 **Supabase**: autenticação, banco de dados, **storage privado** e **RLS**
- 🧪 **Modo demonstração** integrado (roda na hora, sem configurar nada)
- 🔎 **Busca** e **resumo por categoria** (barras coloridas) no extrato
- ⌨️ **Máscara de valor** automática (digita 60000 → R$ 600,00)
- 👆 Toque num **card de conta** para ver o extrato dela; toque na **miniatura** do comprovante para abrir em tela cheia
- 📴 Aviso de **offline** e botão de **instalar** o app
- 🔒 **Trava por PIN** de 4 dígitos ao abrir (com biometria quando o aparelho permitir)

---

## Contas, categorias e regras

**Contas:** Asaas · PagSeguro · Infinity · Dinheiro/Pix
**Categorias:** matrícula, mensalidade, curso/workshop, produto, serviço, comissão,
aluguel, equipe/professor, material, marketing, outros.
**Formas de pagamento:** Pix, dinheiro, cartão, boleto, transferência, outro.

- Entrada **soma** no saldo da conta · Saída **subtrai**.
- **Saldo geral** = soma das quatro contas.
- Todo comprovante fica **privado** (bucket privado + URLs assinadas temporárias).
- Criação, edição e exclusão ficam **registradas no histórico** (auditoria).
- Editar/excluir **exigem confirmação**.

---

## Telas

1. **Painel** — cards de Entradas, Saídas e Saldo geral; saldo por conta;
   filtros (hoje/semana/mês/período); últimas movimentações; botão flutuante.
2. **Novo lançamento** — todos os campos, upload de comprovante e **microfone**.
3. **Extrato** — lista cronológica com filtros por conta, tipo, categoria,
   responsável e período; detalhe completo; editar/excluir com confirmação.

---

## Como rodar (modo demonstração)

É um site estático (sem build). Basta servir a pasta:

```bash
# qualquer servidor estático serve — ex.:
npx serve .
# ou
python3 -m http.server 8080
```

Abra no navegador e toque em **“Entrar no modo demonstração”**.
Os dados de exemplo ficam salvos **apenas neste aparelho** e aparecem marcados
com a etiqueta **DEMO**.

> Service Worker/PWA exigem `https://` ou `http://localhost`.

---

## Conectar ao Supabase (produção)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode o arquivo [`supabase/schema.sql`](./supabase/schema.sql).
   Ele cria a tabela `lancamentos`, o histórico, as políticas **RLS**, o
   **bucket privado** `comprovantes` e insere dados de demonstração (`demo = true`).
3. Crie os usuários autorizados em **Authentication → Users**.
4. Informe as credenciais ao app de uma das formas:
   - **Pelo app:** banner “Conectar Supabase” → cole *Project URL* e *anon key*; **ou**
   - **No código:** preencha `HAIR.SUPABASE` em [`js/config.js`](./js/config.js).
5. Faça login com e-mail e senha.

As credenciais informadas pelo app ficam **somente no aparelho** (localStorage).
A `anon key` é pública por natureza — o acesso aos dados é protegido pelo **RLS**.

### Remover os dados de demonstração
```sql
delete from public.lancamentos where demo = true;
```

---

## Deploy

Site estático — publique a pasta em **Vercel**, **Netlify** ou **GitHub Pages**.
Já incluímos [`vercel.json`](./vercel.json) com os cabeçalhos do Service Worker e do manifest.

---

## Estrutura

```
index.html               App shell (todas as telas)
manifest.webmanifest     Manifesto PWA
sw.js                    Service Worker (cache do app shell)
css/styles.css           Tema navy/dourado, mobile-first
js/config.js             Contas, categorias, formatação R$/datas
js/store.js              Dados: Supabase ou modo demo (localStorage)
js/voice.js              Reconhecimento de voz + interpretação PT-BR
js/app.js                Telas, eventos e renderização
icons/                   Ícones do PWA (SVG + PNG)
supabase/schema.sql      Tabela, histórico, RLS, storage e dados demo
```

---

## Privacidade & segurança

- Comprovantes em **bucket privado**; exibição via **URL assinada** (expira em 1h).
- Acesso a dados e arquivos **somente para usuários autenticados** (políticas RLS).
- Toda alteração/exclusão é registrada em `lancamentos_historico`.
- Interface em **português (BR)**, valores em **R$**, datas **dd/mm/aaaa**.
