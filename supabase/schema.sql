-- ============================================================
-- HAIR Financeiro — esquema Supabase
-- Tabela de lançamentos, histórico (auditoria), RLS e Storage privado.
-- Execute no SQL Editor do seu projeto Supabase.
-- ============================================================

-- 1) TABELA PRINCIPAL --------------------------------------------------------
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
  criado_por       uuid references auth.users(id) on delete set null,
  demo             boolean not null default false
);

create index if not exists idx_lanc_data on public.lancamentos (data_movimento desc);
create index if not exists idx_lanc_conta on public.lancamentos (conta);
create index if not exists idx_lanc_tipo on public.lancamentos (tipo);

-- 2) HISTÓRICO / AUDITORIA ---------------------------------------------------
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

-- Gatilho: registra criação, edição e exclusão automaticamente
create or replace function public.fn_log_lancamento()
returns trigger language plpgsql security definer as $$
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

-- 3) RLS (Row Level Security) -----------------------------------------------
-- Apenas usuários autenticados (autorizados) acessam os dados.
alter table public.lancamentos enable row level security;
alter table public.lancamentos_historico enable row level security;

drop policy if exists "lanc_select" on public.lancamentos;
drop policy if exists "lanc_insert" on public.lancamentos;
drop policy if exists "lanc_update" on public.lancamentos;
drop policy if exists "lanc_delete" on public.lancamentos;

create policy "lanc_select" on public.lancamentos
  for select to authenticated using (true);
create policy "lanc_insert" on public.lancamentos
  for insert to authenticated with check (true);
create policy "lanc_update" on public.lancamentos
  for update to authenticated using (true) with check (true);
create policy "lanc_delete" on public.lancamentos
  for delete to authenticated using (true);

-- Histórico: somente leitura pelo app; escrita apenas via trigger (security definer)
drop policy if exists "hist_select" on public.lancamentos_historico;
create policy "hist_select" on public.lancamentos_historico
  for select to authenticated using (true);

-- 4) STORAGE — bucket privado de comprovantes --------------------------------
insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

-- Nenhum comprovante é público. Somente usuários autenticados acessam,
-- e o app usa URLs assinadas (temporárias) para exibir.
drop policy if exists "comp_select" on storage.objects;
drop policy if exists "comp_insert" on storage.objects;
drop policy if exists "comp_update" on storage.objects;
drop policy if exists "comp_delete" on storage.objects;

create policy "comp_select" on storage.objects
  for select to authenticated using (bucket_id = 'comprovantes');
create policy "comp_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'comprovantes');
create policy "comp_update" on storage.objects
  for update to authenticated using (bucket_id = 'comprovantes');
create policy "comp_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'comprovantes');

-- 5) DADOS DE EXEMPLO (claramente marcados como DEMONSTRAÇÃO) -----------------
-- Todos com demo = true e descrição prefixada com [DEMO].
insert into public.lancamentos (data_movimento, tipo, conta, categoria, descricao, forma_pagamento, responsavel, valor, demo)
values
  (now(),                       'entrada','dinheiro_pix','matricula',   '[DEMO] Matrícula do Wesley',        'pix',           'Recepção',   600.00, true),
  (now() - interval '2 hours',  'entrada','asaas',       'mensalidade', '[DEMO] Mensalidade turma noite',    'cartao',        'Recepção',   350.00, true),
  (now() - interval '1 day',    'saida',  'dinheiro_pix','material',    '[DEMO] Compra de material',         'dinheiro',      'Recepção',   180.00, true),
  (now() - interval '2 day',    'entrada','pagseguro',   'curso',       '[DEMO] Workshop de coloração',      'cartao',        'Recepção',   890.00, true),
  (now() - interval '3 day',    'saida',  'asaas',       'equipe',      '[DEMO] Comissão professora Ana',    'transferencia', 'Financeiro', 420.00, true),
  (now() - interval '5 day',    'saida',  'infinity',    'aluguel',     '[DEMO] Aluguel do espaço',          'boleto',        'Financeiro', 2500.00, true),
  (now() - interval '6 day',    'entrada','infinity',    'produto',     '[DEMO] Venda de kit profissional',  'pix',           'Recepção',   260.00, true),
  (now() - interval '12 day',   'saida',  'dinheiro_pix','marketing',   '[DEMO] Impulsionamento Instagram',  'cartao',        'Marketing',  150.00, true)
on conflict do nothing;

-- Para remover os dados de demonstração depois:
--   delete from public.lancamentos where demo = true;
