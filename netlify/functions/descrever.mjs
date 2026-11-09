// Função do servidor (Netlify): recebe a foto de uma peça e devolve nome + descrição escritos pela IA (Gemini).
// Só funciona para quem está logado no painel (confere o login no Supabase).
import { GoogleGenAI, ApiError } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// Chave configurada no Netlify. A versão v1beta é a que aceita todos os modelos e a resposta em JSON.
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: "v1beta" });

// Modelos tentados em ordem: se um não existir para a sua chave (erro 404), tenta o próximo.
// Para escolher um modelo específico, crie a variável GEMINI_MODEL no Netlify.
const MODELOS = [process.env.GEMINI_MODEL, "gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest"].filter(Boolean);
let modeloQueFunciona = null; // lembra o modelo que deu certo enquanto a função estiver ativa

async function gerar(pedido) {
  const lista = modeloQueFunciona ? [modeloQueFunciona] : MODELOS;
  let ultimoErro;
  for (const model of lista) {
    try {
      const resposta = await gemini.models.generateContent({ model, ...pedido });
      modeloQueFunciona = model;
      return resposta;
    } catch (erro) {
      ultimoErro = erro;
      if (!(erro instanceof ApiError && erro.status === 404)) throw erro;
    }
  }
  throw ultimoErro;
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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

const json = (status, corpo) => Response.json(corpo, { status });

export const config = { path: "/api/descrever" };

export default async function handler(req) {
  if (req.method !== "POST") return json(405, { erro: "Use POST." });

  // 1. Confere se quem pediu está logado no painel
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const { data: login, error: erroLogin } = await supabase.auth.getUser(token);
  if (erroLogin || !login?.user) return json(401, { erro: "Entre no painel de novo para continuar." });

  // 2. Lê a foto e as informações da peça
  const { imagem, categoria, banho, observacoes } = await req.json().catch(() => ({}));
  const partes = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(imagem || "");
  if (!partes) return json(400, { erro: "Envie uma foto em JPG, PNG ou WEBP." });

  const pedido = [
    `Tipo de peça: ${CATEGORIAS[categoria] || categoria}.`,
    banho ? `Banho: ${banho}.` : "",
    observacoes ? `Observações da lojista: ${observacoes}` : "",
    "Crie o nome e a descrição desta peça.",
  ].filter(Boolean).join("\n");

  // 3. Pede o texto à IA
  try {
    const resposta = await gerar({
      contents: [
        { inlineData: { mimeType: partes[1], data: partes[2] } },
        { text: pedido },
      ],
      config: {
        systemInstruction: SISTEMA,
        responseMimeType: "application/json",
        responseJsonSchema: ESQUEMA,
      },
    });

    const texto = resposta.text;
    if (!texto) {
      return json(422, { erro: "A IA não conseguiu descrever esta foto. Tente outra foto ou escreva a descrição à mão." });
    }
    const { nome, descricao } = JSON.parse(texto);
    return json(200, { nome, descricao });
  } catch (erro) {
    console.error(erro);
    // Detalhe técnico curto, para ajudar a descobrir o problema (o Google não repete a chave na mensagem)
    const detalhe = ` [Detalhe: ${erro?.status ?? ""} ${String(erro?.message ?? erro).slice(0, 220)}]`;
    if (erro instanceof ApiError) {
      if (erro.status === 400) {
        return json(500, { erro: "A IA recusou o pedido. Confira a chave GEMINI_API_KEY no Netlify ou tente outra foto." + detalhe });
      }
      if (erro.status === 401 || erro.status === 403) {
        return json(500, { erro: "A chave do Gemini (GEMINI_API_KEY) está errada ou faltando no Netlify." + detalhe });
      }
      if (erro.status === 429) {
        return json(429, { erro: "Limite de uso da IA atingido. Espere um minuto e tente de novo." + detalhe });
      }
      return json(502, { erro: `A IA respondeu com erro (${erro.status}). Tente de novo em instantes.` + detalhe });
    }
    return json(500, { erro: "Não foi possível gerar a descrição agora. Tente de novo." + detalhe });
  }
}
