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

TÍTULO (campo "nome") — bonito e vendedor, como nome de joia de coleção:
- De 3 a 5 palavras. Estrutura: TIPO + MODELO + NOME BONITO.
  • TIPO: Brinco, Colar, Choker, Anel, Pulseira, Conjunto.
  • MODELO: o formato que a cliente reconhece: Ponto de Luz, Argola, Gota, Coração, Solitário, Riviera, Escapulário, Medalha, Nossa Senhora, Espírito Santo, Olho Grego, Borboleta, Cruz, Trevo, Flor, Estrela, Lua, Infinito, Pérola etc.
  • NOME BONITO: uma ou duas palavras elegantes e femininas que dão alma à peça, como: Aurora, Serena, Bella, Luna, Graça, Encanto, Afeto, Doce Amor, Luz Divina, Fé, Bênção, Esperança, Delicadeza, Brilho do Mar, Primavera, Paris, Clássica, Majestade.
- Ex.: "Colar Espírito Santo Luz Divina", "Brinco Coração Doce Amor", "Conjunto Gota Aurora", "Anel Solitário Majestade", "Colar Nossa Senhora Graça", "Brinco Flor Primavera".
- NÃO coloque no título a pedra, a cor da pedra, a zircônia, "cravejado" nem o banho. Esses detalhes vão na descrição.
- O nome bonito deve combinar com a peça (religiosa → Fé, Graça, Bênção, Luz Divina; coração → Afeto, Doce Amor; verde → Esperança, Primavera; azul → Brilho do Mar, Serena).
- Varie o nome bonito: se ele já aparece nos nomes que existem na loja, escolha outro.
- Se a peça for da Linha Luxo, prefira nomes nobres (Majestade, Imperial, Diamante, Realeza, Gala).
- O título precisa ser ÚNICO na loja: nunca repita um nome que já existe. Se a peça for parecida com outra, troque o nome bonito, sem números e sem "II".
- Sem ponto final, sem emoji, sem aspas.

DESCRIÇÃO (campo "descricao"):
- No máximo 2 frases curtas, até 35 palavras no total.
- A primeira frase conta os detalhes que aparecem na foto: a pedra e a cor dela (ex.: zircônias cristal, pedra verde, pedra fusion, pérola), se é cravejada e o banho informado.
- A segunda frase fala do que a cliente vai sentir usando (elegância, brilho, delicadeza) e pode terminar com uma ocasião (dia a dia, festa, presente).
- Tom delicado, confiante e acolhedor. Sem exageros, sem emoji, sem hashtags.

REGRAS:
- Português do Brasil.
- Descreva só o que aparece na foto e o que a lojista informou.
- Nunca invente medidas, peso, tipo de pedra, material da base, preço ou garantia.`;

const ESQUEMA = {
  type: "object",
  properties: {
    nome: { type: "string", description: "Título bonito de 3 a 5 palavras: tipo + modelo + nome bonito, sem pedra nem cor" },
    descricao: { type: "string", description: "Até 2 frases curtas (35 palavras): detalhes da pedra/cor/banho e o sentimento" },
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
