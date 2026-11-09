-- Angel Semijoias — atualização 1 (para quem já rodou o setup.sql antes)
-- Cole tudo no Supabase em "Editor SQL" e clique em "Executar". Pode rodar mais de uma vez sem problema.

-- 1. Nova categoria: Chokers
alter table produtos drop constraint if exists produtos_categoria_check;
alter table produtos add constraint produtos_categoria_check
  check (categoria in ('brincos','colares','chokers','aneis','pulseiras','conjuntos'));

-- 2. Segunda foto de cada peça (criada pela IA)
alter table produtos add column if not exists foto_ia_url text;
alter table produtos add column if not exists foto_ia_caminho text;
