-- Angel Semijoias: cole tudo isto no Supabase em "SQL Editor" e clique em "Run". Só precisa rodar uma vez.

-- Tabela de produtos
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null check (categoria in ('brincos','colares','chokers','aneis','pulseiras','conjuntos')),
  descricao text,
  preco numeric(10,2) not null check (preco >= 0),
  banho text not null default 'Ouro 18k',
  destaque text,                       -- ex.: "Novidade", "Mais vendido" (opcional)
  foto_url text not null,
  foto_caminho text not null,
  ativo boolean not null default true, -- desmarque para esconder da loja sem apagar
  criado_em timestamptz not null default now()
);

alter table produtos enable row level security;

-- Qualquer visitante vê os produtos ativos
drop policy if exists "visitantes veem produtos ativos" on produtos;
create policy "visitantes veem produtos ativos" on produtos
  for select to anon using (ativo);

-- Quem está logado no painel vê e altera tudo
drop policy if exists "painel gerencia produtos" on produtos;
create policy "painel gerencia produtos" on produtos
  for all to authenticated using (true) with check (true);

-- Pasta pública de fotos
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

drop policy if exists "fotos publicas" on storage.objects;
create policy "fotos publicas" on storage.objects
  for select using (bucket_id = 'fotos');

drop policy if exists "painel envia fotos" on storage.objects;
create policy "painel envia fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos');

drop policy if exists "painel apaga fotos" on storage.objects;
create policy "painel apaga fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'fotos');
