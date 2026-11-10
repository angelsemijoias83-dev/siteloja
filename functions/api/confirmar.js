// GET /api/confirmar?payment_id=123 — chamado quando a cliente volta do Mercado Pago.
// Garante a confirmação mesmo se o aviso automático (webhook) atrasar ou não chegar.
import { json } from "../_lib/comum.js";
import { processarPagamento } from "../_lib/pagamento.js";

export async function onRequestGet({ request, env }) {
  if (!env.MP_ACCESS_TOKEN) return json(503, { status: "desativado" });
  const id = new URL(request.url).searchParams.get("payment_id");
  try {
    const r = await processarPagamento(env, id);
    return json(200, { status: r.status });
  } catch (e) {
    console.error("Confirmar:", e);
    return json(500, { status: "erro" });
  }
}
