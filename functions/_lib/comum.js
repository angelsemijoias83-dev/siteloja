// Partes usadas por todas as funções do servidor (Cloudflare Pages Functions).
// As chaves secretas ficam nas variáveis do Cloudflare (ou no arquivo .dev.vars no computador).

export const json = (status, corpo) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json; charset=utf-8" } });

// Confere se quem chamou está logado no painel (Supabase Auth)
export async function usuarioLogado(request, env) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  return r.ok;
}

// Acesso ao banco com a chave secreta do servidor (só usada aqui, nunca no navegador)
export async function banco(env, caminho, opcoes = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "content-type": "application/json",
      Prefer: "return=representation",
      ...(opcoes.headers || {}),
    },
  });
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
  if (!r.ok) throw new Error(`Banco respondeu ${r.status}: ${typeof dados === "string" ? dados : dados?.message || ""}`.slice(0, 300));
  return dados;
}

export const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Lê a foto enviada pelo painel ("data:image/jpeg;base64,...")
export function lerImagem(imagem) {
  const partes = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(imagem || "");
  return partes ? { mimeType: partes[1], data: partes[2] } : null;
}

// Chama o Gemini, tentando os modelos em ordem (se um não existir para a chave, tenta o próximo)
export async function gemini(env, modelos, corpo) {
  let ultimo = null;
  for (const modelo of modelos.filter(Boolean)) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY || "" },
      body: JSON.stringify(corpo),
    });
    const dados = await r.json().catch(() => ({}));
    if (r.status === 404) { ultimo = { status: 404, dados }; continue; }
    return { status: r.status, dados, modelo };
  }
  return ultimo || { status: 404, dados: {} };
}

export function erroGemini(status, dados) {
  const detalhe = ` [Detalhe: ${status} ${String(dados?.error?.message || "").slice(0, 200)}]`;
  if (status === 429) return json(429, { erro: "Limite de uso da IA atingido. Espere um minuto e tente de novo." + detalhe });
  if (status === 400 || status === 401 || status === 403) return json(500, { erro: "A IA recusou o pedido. Confira a chave GEMINI_API_KEY ou tente outra foto." + detalhe });
  if (status === 404) return json(502, { erro: "Nenhum modelo de IA disponível para esta chave." + detalhe });
  return json(502, { erro: "A IA respondeu com erro. Tente de novo em instantes." + detalhe });
}
