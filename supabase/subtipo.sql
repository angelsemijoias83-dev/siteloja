-- Tipo da peça (piercing fake, trio, duo). Rode uma vez no Supabase.
alter table produtos add column if not exists subtipo text;
