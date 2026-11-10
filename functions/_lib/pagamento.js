// Confere um pagamento direto no Mercado Pago (nunca confia só no aviso recebido),
// marca o pedido como pago, baixa o estoque e manda os e-mails. Pode ser chamado várias vezes
// para o mesmo pagamento: só a primeira vez faz efeito.
import { banco, brl, esc } from "./comum.js";

export async function processarPagamento(env, pagamentoId) {
  const id = String(pagamentoId || "").replace(/\D/g, "");
  if (!id) return { status: "invalido" };

  const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  if (!r.ok) return { status: "nao-encontrado" };
  const pag = await r.json();
  const pedidoId = pag.external_reference;
  if (!/^[0-9a-f-]{36}$/i.test(pedidoId || "")) return { status: "sem-pedido" };
  if (pag.status !== "approved") return { status: pag.status, pedido: pedidoId };

  const [pedido] = await banco(env, `pedidos?id=eq.${pedidoId}&select=*`);
  if (!pedido) return { status: "sem-pedido" };
  if (Math.abs(Number(pag.transaction_amount) - Number(pedido.total)) > 0.05) {
    console.error(`Valor pago (${pag.transaction_amount}) diferente do pedido ${pedidoId} (${pedido.total})`);
    return { status: "valor-diferente", pedido: pedidoId };
  }

  const confirmou = await banco(env, "rpc/confirmar_pedido", {
    method: "POST",
    body: JSON.stringify({ p_pedido: pedidoId, p_pagamento: id }),
  });
  if (confirmou === true) {
    await enviarEmails(env, { ...pedido, pagamento_id: id, forma: pag.payment_type_id, parcelas: pag.installments }).catch((e) => console.error("E-mail:", e));
  }
  return { status: "approved", pedido: pedidoId, novo: confirmou === true };
}

// E-mails pelo Resend (resend.com). Sem a chave RESEND_API_KEY, os e-mails são pulados.
async function enviarEmails(env, p) {
  if (!env.RESEND_API_KEY) return;
  const c = p.cliente;
  const itens = p.itens.map((i) => `<tr><td>${i.qtd}x ${esc(i.nome)}${i.tamanho ? ` <b>nº ${esc(i.tamanho)}</b>` : ""} <small>(${esc(i.banho)})</small></td><td align="right">${brl(i.preco * i.qtd)}</td></tr>`).join("");
  const tabela = `<table cellpadding="6" style="border-collapse:collapse;width:100%;max-width:520px">${itens}
    <tr><td>Frete</td><td align="right">${p.frete > 0 ? brl(p.frete) : "Grátis"}</td></tr>
    <tr><td><b>Total</b></td><td align="right"><b>${brl(p.total)}</b></td></tr></table>`;
  const endereco = `${esc(c.logradouro)}, ${esc(c.numero)}${c.complemento ? " – " + esc(c.complemento) : ""}<br>${esc(c.bairro)} · ${esc(c.cidade)} - ${esc(c.uf)} · CEP ${esc(c.cep)}`;
  const forma = { account_money: "Saldo Mercado Pago", credit_card: `Cartão de crédito (${p.parcelas || 1}x)`, debit_card: "Cartão de débito", bank_transfer: "Pix", ticket: "Boleto" }[p.forma] || p.forma || "";

  const enviar = (para, assunto, html) => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_REMETENTE || "Angel Semijoias <onboarding@resend.dev>", to: [para], subject: assunto, html }),
  });

  // Para a loja
  if (env.EMAIL_LOJA) {
    await enviar(env.EMAIL_LOJA, `Nova venda! ${brl(p.total)} – ${c.nome}`, `
      <div style="font-family:Georgia,serif;color:#3B2216">
        <h2>Nova venda no site 🎉</h2>
        ${tabela}
        <p><b>Pagamento:</b> ${esc(forma)} · nº ${esc(p.pagamento_id)}</p>
        <h3>Cliente</h3>
        <p>${esc(c.nome)}<br>CPF ${esc(c.cpf)}<br>Telefone ${esc(c.telefone)}<br>${esc(c.email)}</p>
        <h3>Enviar para</h3>
        <p>${endereco}</p>
        <p style="color:#8A6555">O estoque já foi atualizado. Veja o pedido no painel, em Pedidos.</p>
      </div>`);
  }
  // Para a cliente (só quando o domínio de envio estiver configurado no Resend)
  if (env.EMAIL_REMETENTE) {
    await enviar(c.email, "Recebemos seu pedido – Angel Semijoias", `
      <div style="font-family:Georgia,serif;color:#3B2216">
        <h2>Obrigada pela sua compra, ${esc(c.nome.split(" ")[0])}! 💛</h2>
        <p>Seu pagamento foi aprovado. Vamos separar suas peças com carinho e enviar o código de rastreio pelo WhatsApp.</p>
        ${tabela}
        <h3>Endereço de entrega</h3>
        <p>${endereco}</p>
        <p style="color:#8A6555">Dúvidas? Fale com a gente pelo WhatsApp ${esc(env.WHATSAPP_LOJA || "")}.</p>
      </div>`);
  }
}
