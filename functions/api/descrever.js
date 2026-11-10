// POST /api/descrever — recebe a foto de uma peça e devolve nome + descrição escritos pela IA (Gemini).
// Só funciona para quem está logado no painel.
import { json, usuarioLogado, lerImagem, gemini, erroGemini } from "../_lib/comum.js";

const CATEGORIAS = {
  brincos: "brinco",
  colares: "colar",
  chokers: "choker",
  aneis: "anel",
  pulseiras: "pulseira",
  conjuntos: "conjunto",
};

const SISTEMA = `Você é redatora de vendas da Angel Semijoias, uma loja brasileira de semijoias. Seu texto aparece na vitrine do site, ao lado da foto e do preço.

TÍTULO (campo "nome"):
- De 2 a 5 palavras, fácil de lembrar e com vontade de comprar.
- Comece pelo tipo de peça e junte um detalhe marcante ou um nome charmoso. Ex.: "Brinco Gota Cristal", "Colar Coração Encantado", "Anel Solitário Brilho Eterno".
- Sem ponto final, sem emoji, sem aspas.

DESCRIÇÃO (campo "descricao"):
- No máximo 2 frases curtas, até 30 palavras no total.
- Destaque o que deixa a peça especial e o que a cliente vai sentir usando (elegância, brilho, delicadeza).
- Pode terminar com uma ocasião de uso (dia a dia, festa, presente).
- Tom delicado, confiante e acolhedor. Sem exageros, sem emoji, sem hashtags.

REGRAS:
- Português do Brasil.
- Descreva só o que aparece na foto e o que a lojista informou.
- Nunca invente medidas, peso, tipo de pedra, material da base, preço ou garantia.`;

const ESQUEMA = {
  type: "object",
  properties: {
    nome: { type: "string", description: "Título vendedor de 2 a 5 palavras, começando pelo tipo de peça" },
    descricao: { type: "string", description: "No máximo 2 frases curtas, até 30 palavras" },
  },
  required: ["nome", "descricao"],
};

export async function onRequestPost({ request, env }) {
  if (!(await usuarioLogado(request, env))) return json(401, { erro: "Entre no painel de novo para continuar." });

  const { imagem, categoria, banho, observacoes } = await request.json().catch(() => ({}));
  const foto = lerImagem(imagem);
  if (!foto) return json(400, { erro: "Envie uma foto em JPG, PNG ou WEBP." });

  const pedido = [
    `Tipo de peça: ${CATEGORIAS[categoria] || categoria}.`,
    banho ? `Banho: ${banho}.` : "",
    observacoes ? `Observações da lojista: ${observacoes}` : "",
    "Crie o nome e a descrição desta peça.",
  ].filter(Boolean).join("\n");

  const { status, dados } = await gemini(env, [env.GEMINI_MODEL, "gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest"], {
    systemInstruction: { parts: [{ text: SISTEMA }] },
    contents: [{ parts: [{ inlineData: foto }, { text: pedido }] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: ESQUEMA },
  });
  if (status !== 200) return erroGemini(status, dados);

  const texto = dados?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  try {
    const { nome, descricao } = JSON.parse(texto);
    return json(200, { nome, descricao });
  } catch {
    return json(422, { erro: "A IA não conseguiu descrever esta foto. Tente outra foto ou escreva a descrição à mão." });
  }
}
