-- Linha Luxo: marca as peças que aparecem no cartão "Linha Luxo" da loja.
-- Rode uma vez no Supabase: SQL Editor → New query → colar tudo → Run.
alter table produtos add column if not exists luxo boolean not null default false;
