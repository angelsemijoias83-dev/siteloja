// POST /api/mp-webhook — aviso automático do Mercado Pago quando um pagamento muda.
// O aviso só diz o número do pagamento; os dados são conferidos direto no Mercado Pago.
import { json } from "../_lib/comum.js";
import { processarPagamento } from "../_lib/pagamento.js";

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const corpo = await request.json().catch(() => ({}));
  const tipo = url.searchParams.get("type") || url.searchParams.get("topic") || corpo.type || corpo.topic;
  const id = url.searchParams.get("data.id") || corpo?.data?.id || url.searchParams.get("id");
  if (tipo === "payment" && id) {
    try { await processarPagamento(env, id); } catch (e) { console.error("Webhook:", e); return json(500, { ok: false }); }
  }
  return json(200, { ok: true });
}
