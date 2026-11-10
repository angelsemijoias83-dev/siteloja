-- Numeração dos anéis: estoque separado por número (ex.: {"14": 2, "16": 1}).
-- Rode uma vez no Supabase: Editor SQL → colar tudo → Executar.

alter table produtos add column if not exists tamanhos jsonb;

-- Ao confirmar o pagamento, baixa o estoque total e o da numeração vendida.
create or replace function confirmar_pedido(p_pedido uuid, p_pagamento text)
returns boolean language plpgsql security definer set search_path = public as $$
declare it jsonb; q int; t text;
begin
  update pedidos set status = 'pago', pago_em = now(), pagamento_id = p_pagamento
   where id = p_pedido and status = 'pendente';
  if not found then return false; end if;
  for it in select * from jsonb_array_elements((select itens from pedidos where id = p_pedido)) loop
    q := (it->>'qtd')::int;
    t := it->>'tamanho';
    update produtos set
      estoque = case when estoque is null then null else greatest(estoque - q, 0) end,
      tamanhos = case when t is not null and tamanhos ? t
        then jsonb_set(tamanhos, array[t], to_jsonb(greatest(coalesce((tamanhos->>t)::int, 0) - q, 0)))
        else tamanhos end
     where id = (it->>'id')::uuid;
  end loop;
  return true;
end $$;
revoke execute on function confirmar_pedido(uuid, text) from public, anon, authenticated;
grant execute on function confirmar_pedido(uuid, text) to service_role;
