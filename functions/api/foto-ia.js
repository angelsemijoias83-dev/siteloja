// POST /api/foto-ia — recebe a foto original de uma peça e pede ao Gemini uma segunda foto
// com a peça sendo usada por uma modelo. A lojista revê no painel antes de salvar.
import { json, usuarioLogado, lerImagem, gemini, erroGemini } from "../_lib/comum.js";

const ONDE = {
  brincos: "na orelha de uma mulher, em close da lateral do rosto e do pescoço, cabelo preso",
  colares: "no pescoço e colo de uma mulher, enquadrando do queixo até o colo",
  chokers: "rente ao pescoço de uma mulher, enquadrando do queixo até os ombros",
  aneis: "no dedo de uma mão feminina delicada, unhas naturais e discretas",
  pulseiras: "no pulso de uma mão feminina delicada, em close",
  conjuntos: "em uma mulher, com o colar no pescoço e os brincos visíveis, enquadrando do queixo ao colo",
};

export async function onRequestPost({ request, env }) {
  if (!(await usuarioLogado(request, env))) return json(401, { erro: "Entre no painel de novo para continuar." });

  const { imagem, categoria, banho } = await request.json().catch(() => ({}));
  const foto = lerImagem(imagem);
  if (!foto) return json(400, { erro: "Escolha a foto original da peça primeiro." });

  const pedido = `Crie uma foto realista, estilo editorial de joalheria, mostrando ESTA MESMA peça da imagem ${ONDE[categoria] || "sendo usada por uma mulher"}.
A peça precisa ficar idêntica à da foto: mesmo formato, mesma cor${banho ? ` (${banho})` : ""}, mesma quantidade e posição de pedras, mesmas proporções. Não invente detalhes nem troque o modelo da peça.
Pele natural, luz suave de fim de tarde, fundo desfocado em tons pêssego claro e bege. Foco nítido na peça.
Não mostre o rosto inteiro nem os olhos. Sem texto, sem logotipo, sem marca d'água. Formato vertical.`;

  const { status, dados, modelo } = await gemini(env, [env.GEMINI_IMAGE_MODEL, "gemini-2.5-flash-image", "gemini-3.1-flash-image"], {
    contents: [{ parts: [{ inlineData: foto }, { text: pedido }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5" } },
  });
  if (status !== 200) return erroGemini(status, dados);

  const parte = dados?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  const img = parte?.inlineData || parte?.inline_data;
  if (!img?.data) return json(422, { erro: "A IA não conseguiu criar a foto desta vez. Tente de novo ou use outra foto original." });
  return json(200, { imagem: `data:${img.mimeType || img.mime_type || "image/png"};base64,${img.data}`, modelo });
}
