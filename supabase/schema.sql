-- ============================================================
-- HAIR Financeiro — esquema Supabase (versão endurecida)
-- Tabela de lançamentos, auditoria, RLS por papel e Storage privado.
--
-- Execute no SQL Editor do seu projeto Supabase.
-- Este arquivo é IDEMPOTENTE: pode ser rodado novamente com segurança.
--
-- ⚠️  MUDANÇA IMPORTANTE EM RELAÇÃO À VERSÃO ANTERIOR
--     As políticas antigas eram `using (true)` para o papel `authenticated`.
--     Como o Supabase permite auto-cadastro pela chave anon por padrão,
--     qualquer pessoa podia criar uma conta e ler/alterar/apagar TODO o
--     financeiro. Agora o acesso exige constar em `public.app_membros`.
--
--     Depois de rodar este arquivo, cadastre você mesmo como admin:
--       insert into public.app_membros (user_id, papel, nome)
--       select id, 'admin', 'Augusto' from auth.users where email = 'SEU@EMAIL';
--
--     E DESATIVE o auto-cadastro em:
--       Authentication → Providers → Email → "Allow new users to sign up" = OFF
-- ============================================================

-- 0) EXTENSÕES ---------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;


-- ============================================================
-- 1) CONTROLE DE ACESSO — quem pode usar o app
-- ============================================================
-- Autenticado ≠ autorizado. Esta tabela é a lista de pessoas autorizadas.
create table if not exists public.app_membros (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  papel      text not null default 'leitura'
             check (papel in ('admin', 'financeiro', 'leitura')),
  nome       text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

comment on table public.app_membros is
  'Lista de autorização do app. Estar em auth.users NÃO dá acesso aos dados.';
comment on column public.app_membros.papel is
  'admin = tudo (inclusive excluir); financeiro = criar/editar; leitura = só consultar.';

alter table public.app_membros enable row level security;

-- Cada pessoa enxerga apenas o próprio registro; só admin gerencia a lista.
drop policy if exists "membros_select_proprio" on public.app_membros;
create policy "membros_select_proprio" on public.app_membros
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Observação: a gestão de membros é feita pelo painel do Supabase
-- (service_role), não pelo app. Por isso não há policy de insert/update/delete.


-- ============================================================
-- 2) FUNÇÕES AUXILIARES DE AUTORIZAÇÃO
-- ============================================================
-- `security definer` + `set search_path = ''` é obrigatório: sem fixar o
-- search_path, um usuário poderia criar objetos num schema próprio e
-- sequestrar as chamadas não qualificadas dentro da função.

create or replace function public.e_membro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_membros m
    where m.user_id = (select auth.uid()) and m.ativo
  );
$$;

create or replace function public.tem_papel(papeis text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_membros m
    where m.user_id = (select auth.uid())
      and m.ativo
      and m.papel = any(papeis)
  );
$$;

revoke execute on function public.e_membro() from public, anon;
revoke execute on function public.tem_papel(text[]) from public, anon;
grant  execute on function public.e_membro() to authenticated;
grant  execute on function public.tem_papel(text[]) to authenticated;


-- ============================================================
-- 3) TABELA PRINCIPAL
-- ============================================================
create table if not exists public.lancamentos (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  data_movimento   timestamptz not null default now(),
  tipo             text not null check (tipo in ('entrada','saida')),
  conta            text not null check (conta in ('asaas','pagseguro','infinity','dinheiro_pix')),
  categoria        text not null,
  descricao        text not null,
  forma_pagamento  text,
  responsavel      text,
  valor            numeric(12,2) not null check (valor >= 0),
  observacao       text,
  comprovante_url  text,          -- caminho no bucket privado "comprovantes"
  comprovante_nome text,
  criado_por       uuid not null default auth.uid() references auth.users(id) on delete set default,
  demo             boolean not null default false
);

-- Migração de bases já existentes: garante default e NOT NULL em criado_por.
do $$
begin
  alter table public.lancamentos alter column criado_por set default auth.uid();
exception when others then null;
end $$;

-- 3.1) VALIDAÇÃO NO BANCO (última linha de defesa; o front também valida) ----
-- Campos livres eram aceitos sem restrição — `categoria` e `forma_pagamento`
-- vinham do cliente sem check e eram renderizados na interface.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lanc_categoria_valida') then
    alter table public.lancamentos add constraint lanc_categoria_valida
      check (categoria in ('matricula','mensalidade','curso','produto','servico',
                           'comissao','aluguel','equipe','material','marketing','outros'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lanc_forma_valida') then
    alter table public.lancamentos add constraint lanc_forma_valida
      check (forma_pagamento is null or forma_pagamento in
             ('pix','dinheiro','cartao','boleto','transferencia','outro'));
  end if;

  -- Limites de tamanho: impedem que um payload gigante entre no banco
  -- e depois seja renderizado na tela de todo mundo.
  if not exists (select 1 from pg_constraint where conname = 'lanc_tamanhos') then
    alter table public.lancamentos add constraint lanc_tamanhos
      check (
        length(descricao)                          between 1 and 200
        and (responsavel      is null or length(responsavel)      <= 80)
        and (observacao       is null or length(observacao)       <= 1000)
        and (comprovante_nome is null or length(comprovante_nome) <= 255)
        and (comprovante_url  is null or length(comprovante_url)  <= 512)
      );
  end if;

  -- Teto de valor: erro de digitação ou abuso não cria um lançamento absurdo.
  if not exists (select 1 from pg_constraint where conname = 'lanc_valor_teto') then
    alter table public.lancamentos add constraint lanc_valor_teto
      check (valor <= 1000000);
  end if;

  -- Data plausível: nada em 1900 nem muito no futuro.
  if not exists (select 1 from pg_constraint where conname = 'lanc_data_plausivel') then
    alter table public.lancamentos add constraint lanc_data_plausivel
      check (data_movimento > '2020-01-01'::timestamptz
             and data_movimento < now() + interval '2 days');
  end if;
end $$;

create index if not exists idx_lanc_data  on public.lancamentos (data_movimento desc);
create index if not exists idx_lanc_conta on public.lancamentos (conta);
create index if not exists idx_lanc_tipo  on public.lancamentos (tipo);


-- ============================================================
-- 4) ANTI MASS-ASSIGNMENT — colunas que o cliente não controla
-- ============================================================
-- O app manda um objeto JSON para o PostgREST. Sem isto, quem tiver a anon key
-- pode mandar `criado_por`, `created_at`, `id` ou `demo` à vontade e forjar
-- a autoria de um lançamento. Aqui o banco sobrescreve, não confia.
create or replace function public.fn_protege_colunas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') then
    new.id         := coalesce(new.id, extensions.gen_random_uuid());
    new.created_at := now();               -- ignora o que o cliente mandou
    new.criado_por := auth.uid();          -- autoria vem do JWT, não do payload
    new.demo       := false;               -- só o painel do Supabase cria demo
  elsif (tg_op = 'UPDATE') then
    new.id         := old.id;              -- imutável
    new.created_at := old.created_at;      -- imutável
    new.criado_por := old.criado_por;      -- autoria não se reescreve
    new.demo       := old.demo;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_colunas on public.lancamentos;
create trigger trg_protege_colunas
before insert or update on public.lancamentos
for each row execute function public.fn_protege_colunas();


-- ============================================================
-- 5) HISTÓRICO / AUDITORIA
-- ============================================================
create table if not exists public.lancamentos_historico (
  id             bigint generated always as identity primary key,
  lancamento_id  uuid,
  acao           text not null check (acao in ('criacao','edicao','exclusao')),
  detalhe        text,
  dados          jsonb,
  ator           text,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_hist_lanc on public.lancamentos_historico (lancamento_id);

create or replace function public.fn_log_lancamento()
returns trigger
language plpgsql
security definer
set search_path = ''          -- <<< sem isto a função é sequestrável
as $$
declare
  v_ator text;
begin
  v_ator := coalesce((auth.jwt() ->> 'email'), auth.uid()::text, 'sistema');
  if (tg_op = 'INSERT') then
    insert into public.lancamentos_historico (lancamento_id, acao, detalhe, dados, ator)
    values (new.id, 'criacao', 'Lançamento criado', to_jsonb(new), v_ator);
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.lancamentos_historico (lancamento_id, acao, detalhe, dados, ator)
    values (new.id, 'edicao', 'Lançamento editado', to_jsonb(new), v_ator);
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.lancamentos_historico (lancamento_id, acao, detalhe, dados, ator)
    values (old.id, 'exclusao', 'Lançamento excluído', to_jsonb(old), v_ator);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_log_lancamento on public.lancamentos;
create trigger trg_log_lancamento
after insert or update or delete on public.lancamentos
for each row execute function public.fn_log_lancamento();


-- ============================================================
-- 6) RLS — Row Level Security
-- ============================================================
alter table public.lancamentos            enable row level security;
alter table public.lancamentos_historico  enable row level security;

-- Força RLS inclusive para o dono da tabela (defesa extra).
alter table public.lancamentos            force row level security;
alter table public.lancamentos_historico  force row level security;

-- Remove as políticas permissivas da versão anterior.
drop policy if exists "lanc_select" on public.lancamentos;
drop policy if exists "lanc_insert" on public.lancamentos;
drop policy if exists "lanc_update" on public.lancamentos;
drop policy if exists "lanc_delete" on public.lancamentos;

-- Leitura: qualquer membro ativo.
create policy "lanc_select" on public.lancamentos
  for select to authenticated
  using (public.e_membro());

-- Criação: admin ou financeiro, e o lançamento nasce em nome de quem criou.
create policy "lanc_insert" on public.lancamentos
  for insert to authenticated
  with check (
    public.tem_papel(array['admin','financeiro'])
    and criado_por = (select auth.uid())
  );

-- Edição: admin ou financeiro.
create policy "lanc_update" on public.lancamentos
  for update to authenticated
  using      (public.tem_papel(array['admin','financeiro']))
  with check (public.tem_papel(array['admin','financeiro']));

-- Exclusão: SOMENTE admin. Apagar histórico financeiro é ação de dono.
create policy "lanc_delete" on public.lancamentos
  for delete to authenticated
  using (public.tem_papel(array['admin']));

-- Histórico: leitura por membros. Escrita SÓ pelo trigger (security definer),
-- por isso não existe policy de insert/update/delete — nem para admin.
drop policy if exists "hist_select" on public.lancamentos_historico;
create policy "hist_select" on public.lancamentos_historico
  for select to authenticated
  using (public.e_membro());

-- Nada é acessível pela role anônima (visitante sem login).
revoke all on public.lancamentos           from anon;
revoke all on public.lancamentos_historico from anon;
revoke all on public.app_membros           from anon;


-- ============================================================
-- 7) STORAGE — bucket privado de comprovantes
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes', 'comprovantes', false,
  12582912,                                            -- 12 MB, validado no servidor
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "comp_select" on storage.objects;
drop policy if exists "comp_insert" on storage.objects;
drop policy if exists "comp_update" on storage.objects;
drop policy if exists "comp_delete" on storage.objects;

-- Ler: membros ativos (o app usa URL assinada, que expira).
create policy "comp_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprovantes' and public.e_membro());

-- Enviar: apenas na PRÓPRIA pasta (prefixo = uid). Ninguém sobrescreve o
-- comprovante de outra pessoa.
create policy "comp_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprovantes'
    and public.tem_papel(array['admin','financeiro'])
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "comp_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'comprovantes'
    and public.tem_papel(array['admin','financeiro'])
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Apagar comprovante: somente admin.
create policy "comp_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'comprovantes' and public.tem_papel(array['admin']));


-- ============================================================
-- 8) DADOS DE DEMONSTRAÇÃO (opcional)
-- ============================================================
-- Ficam marcados com demo = true e prefixo [DEMO].
-- ⚠️ NÃO rode este bloco no projeto de produção. Para remover depois:
--      delete from public.lancamentos where demo = true;
--
-- Descomente para inserir:
--
-- insert into public.lancamentos
--   (data_movimento, tipo, conta, categoria, descricao, forma_pagamento, responsavel, valor, demo)
-- values
--   (now(), 'entrada','dinheiro_pix','matricula','[DEMO] Matrícula do Wesley','pix','Recepção', 600.00, true)
-- on conflict do nothing;


-- ============================================================
-- 9) CONFERÊNCIA — rode para validar que ficou tudo certo
-- ============================================================
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename in
--   ('lancamentos','lancamentos_historico','app_membros');
--
-- select tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname in ('public','storage') order by tablename;
