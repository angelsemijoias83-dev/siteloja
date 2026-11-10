// POST /api/checkout — recebe a sacolinha e os dados da cliente, confere preços e estoque no banco,
// registra o pedido e cria o pagamento no Mercado Pago. Devolve o link para a cliente pagar.
// Os preços sempre vêm do banco, nunca do navegador.
import { json, banco } from "../_lib/comum.js";
import { buscarCep, calcularFrete, cpfValido, LOJA } from "../_lib/loja.js";

const UUID = /^[0-9a-f-]{36}$/i;

export async function onRequestPost({ request, env }) {
  if (!env.MP_ACCESS_TOKEN || !env.SUPABASE_SERVICE_KEY) {
    return json(503, { erro: "O pagamento pelo site ainda não está ativado. Peça pelo WhatsApp, por favor." });
  }
  const { itens, cliente: c } = await request.json().catch(() => ({}));

  // 1. Dados da cliente
  const cliente = {
    nome: String(c?.nome || "").trim().slice(0, 120),
    email: String(c?.email || "").trim().toLowerCase().slice(0, 160),
    cpf: String(c?.cpf || "").replace(/\D/g, ""),
    telefone: String(c?.telefone || "").replace(/\D/g, "").slice(0, 13),
    numero: String(c?.numero || "").trim().slice(0, 20),
    complemento: String(c?.complemento || "").trim().slice(0, 80),
  };
  if (cliente.nome.split(/\s+/).length < 2) return json(400, { erro: "Escreva seu nome completo." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) return json(400, { erro: "Confira o seu e-mail." });
  if (!cpfValido(cliente.cpf)) return json(400, { erro: "Confira o seu CPF." });
  if (cliente.telefone.length < 10) return json(400, { erro: "Confira o seu telefone com DDD." });
  if (!cliente.numero) return json(400, { erro: "Escreva o número do endereço." });
  const end = await buscarCep(c?.cep);
  if (!end) return json(400, { erro: "CEP não encontrado. Confira os números." });
  if (end.indisponivel) return json(503, { erro: "Não conseguimos consultar o CEP agora. Tente de novo em instantes." });
  Object.assign(cliente, end, {
    logradouro: String(c?.logradouro || end.logradouro).trim().slice(0, 160),
    bairro: String(c?.bairro || end.bairro).trim().slice(0, 80),
  });
  if (!cliente.logradouro || !cliente.bairro) return json(400, { erro: "Complete a rua e o bairro." });

  // 2. Peças: preço e estoque conferidos no banco
  const pedidos = (Array.isArray(itens) ? itens : [])
    .map((i) => ({ id: String(i?.id || ""), qtd: Math.floor(Number(i?.qtd)), tamanho: i?.tamanho ? String(i.tamanho).slice(0, 6) : null }))
    .filter((i) => UUID.test(i.id) && i.qtd > 0 && i.qtd <= 20);
  if (!pedidos.length) return json(400, { erro: "Sua sacolinha está vazia." });
  const ids = [...new Set(pedidos.map((i) => i.id))];
  const produtos = await banco(env, `produtos?select=id,nome,banho,preco,estoque,tamanhos,ativo&id=in.(${ids.join(",")})`);
  const linhas = [];
  for (const i of pedidos) {
    const p = produtos.find((x) => x.id === i.id);
    if (!p || !p.ativo) return json(409, { erro: "Uma das peças não está mais disponível. Atualize a página." });
    const comNumeracao = p.tamanhos && Object.keys(p.tamanhos).length > 0;
    if (comNumeracao) {
      if (!i.tamanho) return json(409, { erro: `Escolha a numeração de ${p.nome}.` });
      const tem = Number(p.tamanhos[i.tamanho]) || 0;
      if (tem < i.qtd) {
        return json(409, { erro: tem === 0 ? `${p.nome} nº ${i.tamanho} esgotou. Tire da sacolinha para continuar.` : `Só temos ${tem} unidade(s) de ${p.nome} nº ${i.tamanho}.` });
      }
    } else if (p.estoque !== null && p.estoque < i.qtd) {
      return json(409, { erro: p.estoque === 0 ? `${p.nome} esgotou. Tire da sacolinha para continuar.` : `Só temos ${p.estoque} unidade(s) de ${p.nome}.` });
    }
    linhas.push({ id: p.id, nome: p.nome, banho: p.banho, preco: Number(p.preco), qtd: i.qtd, ...(comNumeracao ? { tamanho: i.tamanho } : {}) });
  }
  const subtotal = Math.round(linhas.reduce((s, l) => s + l.preco * l.qtd, 0) * 100) / 100;
  const frete = calcularFrete(cliente.uf, subtotal);
  const total = Math.round((subtotal + frete) * 100) / 100;

  // 3. Registra o pedido (aguardando pagamento)
  const [pedido] = await banco(env, "pedidos", {
    method: "POST",
    body: JSON.stringify({ cliente, itens: linhas, subtotal, frete, total, status: "pendente" }),
  });

  // 4. Cria o pagamento no Mercado Pago
  const origem = new URL(request.url).origin;
  const seguro = origem.startsWith("https://");
  const preferencia = {
    items: linhas.map((l) => ({ id: l.id, title: `${l.nome}${l.tamanho ? ` nº ${l.tamanho}` : ""} (${l.banho})`, quantity: l.qtd, unit_price: l.preco, currency_id: "BRL" })),
    shipments: { cost: frete, mode: "not_specified" },
    payer: {
      name: cliente.nome, email: cliente.email,
      identification: { type: "CPF", number: cliente.cpf },
      phone: { area_code: cliente.telefone.slice(0, 2), number: cliente.telefone.slice(2) },
      address: { zip_code: cliente.cep, street_name: cliente.logradouro, street_number: cliente.numero },
    },
    external_reference: pedido.id,
    back_urls: {
      success: `${origem}/?retorno=sucesso`,
      pending: `${origem}/?retorno=pendente`,
      failure: `${origem}/?retorno=falhou`,
    },
    ...(seguro ? { auto_return: "approved", notification_url: `${origem}/api/mp-webhook` } : {}),
    payment_methods: { installments: LOJA.PARCELAS },
    statement_descriptor: "ANGELSEMIJOIA",
  };
  const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, "content-type": "application/json", "X-Idempotency-Key": pedido.id },
    body: JSON.stringify(preferencia),
  });
  const mp = await r.json().catch(() => ({}));
  if (!r.ok || !(mp.init_point || mp.sandbox_init_point)) {
    console.error("Mercado Pago:", r.status, JSON.stringify(mp).slice(0, 400));
    return json(502, { erro: `Não foi possível abrir o pagamento agora. Tente de novo ou peça pelo WhatsApp. [Detalhe: ${r.status} ${String(mp.message || "").slice(0, 160)}]` });
  }
  return json(200, { url: mp.init_point || mp.sandbox_init_point, pedido: pedido.id, total });
}
