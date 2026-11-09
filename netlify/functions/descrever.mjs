// Função do servidor (Netlify): recebe a foto de uma peça e devolve nome + descrição escritos pela IA (Gemini).
// Só funciona para quem está logado no painel (confere o login no Supabase).
import { GoogleGenAI, ApiError } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); // chave configurada no Netlify
const MODELO = process.env.GEMINI_MODEL || "gemini-flash-latest";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const CATEGORIAS = {
  brincos: "brinco",
  colares: "colar",
  aneis: "anel",
  pulseiras: "pulseira",
  conjuntos: "conjunto",
};

const SISTEMA = `Você escreve textos de produto para a Angel Semijoias, uma loja brasileira de semijoias.
Escreva em português do Brasil, com tom delicado, acolhedor e elegante, sem exageros.
Descreva só o que dá para ver na foto (formato, acabamento, pedras aparentes, estilo) e as informações que a lojista passar.
Nunca invente medidas, peso, tipo de pedra, material da base ou garantia que não foram informados.
Sugira ocasiões de uso e combinações quando fizer sentido.`;

const ESQUEMA = {
  type: "object",
  properties: {
    nome: { type: "string", description: "Nome curto e bonito para a peça, até 5 palavras" },
    descricao: { type: "string", description: "Descrição de 2 a 4 frases para a página do produto" },
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
    const resposta = await gemini.models.generateContent({
      model: MODELO,
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
