// GET /api/frete?cep=00000000&subtotal=123.45 — devolve o endereço do CEP e o valor do frete.
import { json } from "../_lib/comum.js";
import { buscarCep, calcularFrete, LOJA } from "../_lib/loja.js";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const end = await buscarCep(url.searchParams.get("cep"));
  if (!end) return json(404, { erro: "CEP não encontrado. Confira os números." });
  const subtotal = Number(url.searchParams.get("subtotal")) || 0;
  const frete = calcularFrete(end.uf, subtotal);
  return json(200, { ...end, frete, gratisAcima: LOJA.FRETE_GRATIS_ACIMA });
}
