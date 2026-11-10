// Regras de venda da loja usadas pelo servidor (frete e parcelas).
// Se mudar algum valor aqui, mude também o texto em public/config.js para o site mostrar igual.

export const LOJA = {
  FRETE_GRATIS_ACIMA: 199,   // compras a partir deste valor (sem o frete) não pagam frete
  PARCELAS: 6,               // máximo de parcelas sem juros no cartão

  // Valor do frete por estado (sigla). "outros" vale para todos os estados que não aparecem na lista.
  FRETE: {
    SP: 15,
    PR: 22, SC: 22, RS: 22, RJ: 22, MG: 22, ES: 22,
    outros: 30,
  },
};

export function calcularFrete(uf, subtotal) {
  if (subtotal >= LOJA.FRETE_GRATIS_ACIMA) return 0;
  return LOJA.FRETE[uf] ?? LOJA.FRETE.outros;
}

// Busca o endereço pelo CEP (ViaCEP, serviço público e gratuito)
export async function buscarCep(cep) {
  const so = String(cep || "").replace(/\D/g, "");
  if (so.length !== 8) return null;
  const r = await fetch(`https://viacep.com.br/ws/${so}/json/`);
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  if (!d || d.erro) return null;
  return { cep: so, logradouro: d.logradouro || "", bairro: d.bairro || "", cidade: d.localidade || "", uf: d.uf || "" };
}

export function cpfValido(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
