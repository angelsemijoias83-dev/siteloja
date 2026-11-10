-- Angel Semijoias — atualização (para quem já rodou o setup.sql antes)
-- Cole tudo no Supabase em "Editor SQL" e clique em "Executar". Pode rodar mais de uma vez sem problema.

-- 1. Nova categoria: Chokers
alter table produtos drop constraint if exists produtos_categoria_check;
alter table produtos add constraint produtos_categoria_check
  check (categoria in ('brincos','colares','chokers','aneis','pulseiras','conjuntos'));

-- 2. Segunda foto de cada peça (criada pela IA)
alter table produtos add column if not exists foto_ia_url text;
alter table produtos add column if not exists foto_ia_caminho text;

-- 3. Estoque (vazio = sem controle de estoque; 0 = esgotada)
alter table produtos add column if not exists estoque integer;
alter table produtos drop constraint if exists produtos_estoque_check;
alter table produtos add constraint produtos_estoque_check check (estoque is null or estoque >= 0);

-- 4. Pedidos pagos pelo site (Mercado Pago)
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente','pago','enviado','cancelado')),
  cliente jsonb not null,          -- nome, e-mail, CPF, telefone e endereço de entrega
  itens jsonb not null,            -- [{ id, nome, banho, preco, qtd }]
  subtotal numeric(10,2) not null,
  frete numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  pagamento_id text,
  pago_em timestamptz,
  rastreio text
);
alter table pedidos enable row level security;
drop policy if exists "painel ve pedidos" on pedidos;
create policy "painel ve pedidos" on pedidos for select to authenticated using (true);
drop policy if exists "painel altera pedidos" on pedidos;
create policy "painel altera pedidos" on pedidos for update to authenticated using (true) with check (true);
-- (visitantes não veem nem criam pedidos direto: quem cria é o servidor do site, com a chave secreta)

-- 5. Confirma o pagamento e baixa o estoque de uma vez só (não repete se o aviso chegar duas vezes)
create or replace function confirmar_pedido(p_pedido uuid, p_pagamento text)
returns boolean language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  update pedidos set status = 'pago', pago_em = now(), pagamento_id = p_pagamento
   where id = p_pedido and status = 'pendente';
  if not found then return false; end if;
  for it in select * from jsonb_array_elements((select itens from pedidos where id = p_pedido)) loop
    update produtos set estoque = greatest(estoque - (it->>'qtd')::int, 0)
     where id = (it->>'id')::uuid and estoque is not null;
  end loop;
  return true;
end $$;
revoke execute on function confirmar_pedido(uuid, text) from public, anon, authenticated;
grant execute on function confirmar_pedido(uuid, text) to service_role;
