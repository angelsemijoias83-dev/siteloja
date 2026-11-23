// POST /api/foto-ia — recebe a foto original de uma peça e pede ao Gemini uma segunda foto
// com a peça sendo usada por uma modelo. A lojista revê no painel antes de salvar.
import { json, usuarioLogado, lerImagem, gemini, erroGemini } from "../_lib/comum.js";

// tipos específicos: onde a peça aparece e quantas peças mostrar
const TIPO = {
  piercing: { onde: "presa na cartilagem da orelha (na borda de cima, hélice), como um piercing fake de clipe, sem furo no lóbulo", pecas: 1, nome: "piercing fake" },
  trio: { onde: "na orelha, com exatamente TRÊS peças: uma no lóbulo (embaixo), uma na parte do meio da cartilagem e uma na borda de cima da orelha. Nenhuma outra peça além dessas três", pecas: 3, nome: "trio de brincos" },
  duo: { onde: "na orelha, com as DUAS peças do duo juntas e bem visíveis (uma no lóbulo e outra na cartilagem, ou uma em cada orelha, o que ficar mais bonito)", pecas: 2, nome: "duo de brincos" },
};

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

  const { imagem, categoria, banho, ajuste, subtipo } = await request.json().catch(() => ({}));
  const foto = lerImagem(imagem);
  if (!foto) return json(400, { erro: "Escolha a foto original da peça primeiro." });

  const tipo = TIPO[subtipo];
  const onde = tipo ? tipo.onde : (ONDE[categoria] || "sendo usada por uma mulher");
  const contagem = tipo
    ? `\nQUANTIDADE: a peça é ${tipo.nome}, ou seja, o conjunto tem exatamente ${tipo.pecas} peça(s). Conte as peças da foto original e mostre EXATAMENTE essa quantidade na foto final: nem mais, nem menos. Não invente peças extras.`
    : "";
  const pedido = `Crie uma foto realista, estilo editorial de joalheria, mostrando ESTA MESMA peça da imagem ${onde}.${contagem}
A peça precisa ficar idêntica à da foto: mesmo formato, mesma cor${banho ? ` (${banho})` : ""}, mesma quantidade e posição de pedras, mesmas proporções. Não invente detalhes nem troque o modelo da peça.
TAMANHO REAL: é uma semijoia delicada, em tamanho real e discreto. Mantenha a escala verdadeira em relação ao corpo (orelha, pescoço, dedo, pulso); nunca aumente a peça para ela aparecer mais. Na dúvida, deixe a peça menor e mais delicada, não maior.
${ajuste ? `Pedido da lojista (siga com prioridade): ${String(ajuste).slice(0, 200)}
` : ""}Pele natural, luz suave de fim de tarde, fundo desfocado em tons pêssego claro e bege. Foco nítido na peça.
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
