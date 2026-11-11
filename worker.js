// Porta de entrada do site no Cloudflare (Worker com arquivos estáticos).
// As rotas /api/... vão para as funções do servidor; o resto é a loja e o painel (pasta public).
import { onRequestPost as descrever } from "./functions/api/descrever.js";
import { onRequestPost as fotoIa } from "./functions/api/foto-ia.js";
import { onRequestGet as frete } from "./functions/api/frete.js";
import { onRequestPost as checkout } from "./functions/api/checkout.js";
import { onRequestGet as confirmar } from "./functions/api/confirmar.js";
import { onRequestPost as mpWebhook } from "./functions/api/mp-webhook.js";
import { json } from "./functions/_lib/comum.js";

const ROTAS = {
  "POST /api/descrever": descrever,
  "POST /api/foto-ia": fotoIa,
  "GET /api/frete": frete,
  "POST /api/checkout": checkout,
  "GET /api/confirmar": confirmar,
  "POST /api/mp-webhook": mpWebhook,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), { pathname } = url;
    // atalhos para o painel (endereço certo: /admin)
    if (/^\/(adm|painel|admim)\/?$/i.test(pathname)) return Response.redirect(`${url.origin}/admin`, 301);
    if (pathname.startsWith("/api/")) {
      const rota = ROTAS[`${request.method} ${pathname.replace(/\/$/, "")}`];
      if (!rota) return json(404, { erro: "Endereço não encontrado." });
      try {
        return await rota({ request, env, waitUntil: (p) => ctx.waitUntil(p) });
      } catch (e) {
        console.error(pathname, e);
        return json(500, { erro: "Algo deu errado no servidor. Tente de novo em instantes." });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
