// Função do servidor (Netlify Edge): recebe a foto original de uma peça e pede ao Gemini
// uma segunda foto com a peça sendo usada por uma modelo. A lojista revê antes de salvar.
// É "edge" porque gerar imagem pode passar de 10 segundos, o limite das funções comuns no plano grátis.

const env = (nome) => globalThis.Netlify?.env?.get(nome) ?? globalThis.process?.env?.[nome];

// Modelos tentados em ordem; se um não existir para a chave (erro 404), tenta o próximo.
// Para escolher outro, crie a variável GEMINI_IMAGE_MODEL no Netlify.
const MODELOS = () => [env("GEMINI_IMAGE_MODEL"), "gemini-2.5-flash-image", "gemini-3.1-flash-image"].filter(Boolean);

const ONDE = {
  brincos: "na orelha de uma mulher, em close da lateral do rosto e do pescoço, cabelo preso",
  colares: "no pescoço e colo de uma mulher, enquadrando do queixo até o colo",
  chokers: "rente ao pescoço de uma mulher, enquadrando do queixo até os ombros",
  aneis: "no dedo de uma mão feminina delicada, unhas naturais e discretas",
  pulseiras: "no pulso de uma mão feminina delicada, em close",
  conjuntos: "em uma mulher, com o colar no pescoço e os brincos visíveis, enquadrando do queixo ao colo",
};

const json = (status, corpo) => new Response(JSON.stringify(corpo), {
  status, headers: { "content-type": "application/json; charset=utf-8" },
});

async function usuarioLogado(token) {
  if (!token) return false;
  const r = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}` },
  });
  return r.ok;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  // 1. Só quem está logado no painel
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!(await usuarioLogado(token))) return json(401, { erro: "Entre no painel de novo para continuar." });

  // 2. Foto original e categoria
  const { imagem, categoria, banho } = await req.json().catch(() => ({}));
  const partes = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(imagem || "");
  if (!partes) return json(400, { erro: "Escolha a foto original da peça primeiro." });

  const pedido = `Crie uma foto realista, estilo editorial de joalheria, mostrando ESTA MESMA peça da imagem ${ONDE[categoria] || "sendo usada por uma mulher"}.
A peça precisa ficar idêntica à da foto: mesmo formato, mesma cor${banho ? ` (${banho})` : ""}, mesma quantidade e posição de pedras, mesmas proporções. Não invente detalhes nem troque o modelo da peça.
Pele natural, luz suave de fim de tarde, fundo desfocado em tons pêssego claro e bege. Foco nítido na peça.
Não mostre o rosto inteiro nem os olhos. Sem texto, sem logotipo, sem marca d'água. Formato vertical.`;

  const corpo = {
    contents: [{ parts: [
      { inlineData: { mimeType: partes[1], data: partes[2] } },
      { text: pedido },
    ] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5" } },
  };

  // 3. Pede a imagem ao Gemini
  let ultimo = null;
  for (const modelo of MODELOS()) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") || "" },
        body: JSON.stringify(corpo),
      });
    } catch (e) {
      return json(502, { erro: "Não foi possível falar com a IA agora. Tente de novo." });
    }
    const dados = await r.json().catch(() => ({}));
    if (r.status === 404) { ultimo = dados; continue; }
    if (!r.ok) {
      const detalhe = ` [Detalhe: ${r.status} ${String(dados?.error?.message || "").slice(0, 200)}]`;
      if (r.status === 429) return json(429, { erro: "Limite de uso da IA atingido. Espere um minuto e tente de novo." + detalhe });
      if (r.status === 400 || r.status === 401 || r.status === 403) return json(500, { erro: "A IA recusou o pedido. Confira a chave GEMINI_API_KEY ou tente outra foto." + detalhe });
      return json(502, { erro: "A IA respondeu com erro. Tente de novo em instantes." + detalhe });
    }
    const img = dados?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
    const dadosImg = img?.inlineData || img?.inline_data;
    if (!dadosImg?.data) {
      return json(422, { erro: "A IA não conseguiu criar a foto desta vez. Tente de novo ou use outra foto original." });
    }
    return json(200, { imagem: `data:${dadosImg.mimeType || dadosImg.mime_type || "image/png"};base64,${dadosImg.data}`, modelo });
  }
  return json(502, { erro: `Nenhum modelo de imagem disponível para esta chave. [Detalhe: ${String(ultimo?.error?.message || "").slice(0, 200)}]` });
};

export const config = { path: "/api/foto-ia" };
