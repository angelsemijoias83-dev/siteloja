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

TÍTULO (campo "nome") — comercial, como nas vitrines das grandes lojas de semijoias:
- De 3 a 6 palavras. A cliente precisa entender na hora o que é a peça e ter vontade de clicar.
- Estrutura: TIPO + MODELO + DIFERENCIAL.
  • TIPO: Brinco, Colar, Choker, Anel, Pulseira, Conjunto.
  • MODELO: o nome que a cliente procura na loja: Ponto de Luz, Argola, Gota, Coração, Solitário, Riviera, Tennis, Escapulário, Medalha, Nossa Senhora, Olho Grego, Borboleta, Cruz, Trevo, Elos, Veneziana, Ear Cuff, Pérola etc.
  • DIFERENCIAL: o que dá valor e aparece na foto: Cravejado, Zircônias, Pérola, cor da pedra (Verde Esmeralda, Azul Safira, Rosa, Cristal), Pedra Fusion, Dupla Face, Delicado, Maxi, Mini.
- Ex.: "Brinco Ponto de Luz Zircônia Cristal", "Colar Nossa Senhora Cravejado Azul", "Conjunto Gota Verde Esmeralda", "Anel Solitário Zircônia Cravejado", "Argola Cravejada Maxi", "Choker Riviera Zircônias".
- Use termos concretos de joalheria. Evite adjetivos vagos ou poéticos ("Encantador", "Vibrante", "Esplendor", "Radiante", "Eterno", "Mágico").
- Se a peça for da Linha Luxo, pode terminar com "Luxo" (ex.: "Colar Cruz Pedra Fusion Luxo").
- O título precisa ser ÚNICO na loja: nunca repita um nome que já existe. Se a peça for parecida com outra, mude o modelo ou o diferencial (cor da pedra, formato, tamanho, detalhe), sem números e sem "II".
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
    nome: { type: "string", description: "Título comercial de 3 a 6 palavras: tipo + modelo + diferencial" },
    descricao: { type: "string", description: "No máximo 2 frases curtas, até 30 palavras" },
  },
  required: ["nome", "descricao"],
};

export async function onRequestPost({ request, env }) {
  if (!(await usuarioLogado(request, env))) return json(401, { erro: "Entre no painel de novo para continuar." });

  const { imagem, categoria, banho, observacoes, luxo, evitar } = await request.json().catch(() => ({}));
  // nomes que já existem na loja (o painel manda), para a IA não repetir
  const existentes = (Array.isArray(evitar) ? evitar : []).map((n) => String(n).trim().slice(0, 80)).filter(Boolean).slice(0, 400);
  const chave = (n) => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const usados = new Set(existentes.map(chave));
  const foto = lerImagem(imagem);
  if (!foto) return json(400, { erro: "Envie uma foto em JPG, PNG ou WEBP." });

  const pedido = [
    `Tipo de peça: ${CATEGORIAS[categoria] || categoria}.`,
    banho ? `Banho: ${banho}.` : "",
    luxo ? "Esta peça é da Linha Luxo da loja." : "",
    observacoes ? `Observações da lojista: ${observacoes}` : "",
    existentes.length ? `Nomes que JÁ EXISTEM na loja (não use nenhum deles):\n${existentes.map((n) => `- ${n}`).join("\n")}` : "",
    "Crie o nome e a descrição desta peça.",
  ].filter(Boolean).join("\n");

  // até 2 tentativas: se a IA repetir um nome, pede de novo avisando qual foi
  let aviso = "", ultimo = null;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { status, dados } = await gemini(env, [env.GEMINI_MODEL, "gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest"], {
      systemInstruction: { parts: [{ text: SISTEMA }] },
      contents: [{ parts: [{ inlineData: foto }, { text: pedido + aviso }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: ESQUEMA },
    });
    if (status !== 200) return erroGemini(status, dados);
    const texto = dados?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
    let r; try { r = JSON.parse(texto); } catch { r = null; }
    if (!r?.nome) continue;
    ultimo = r;
    if (!usados.has(chave(r.nome))) return json(200, { nome: r.nome, descricao: r.descricao });
    aviso = `\nATENÇÃO: "${r.nome}" já existe na loja. Crie outro nome diferente.`;
  }
  if (ultimo) return json(200, { nome: ultimo.nome, descricao: ultimo.descricao, repetido: true });
  return json(422, { erro: "A IA não conseguiu descrever esta foto. Tente outra foto ou escreva a descrição à mão." });
}
