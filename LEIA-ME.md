# Angel Semijoias: guia do site

## Como o site funciona

- **Loja** (`public/index.html`): vitrine por categorias, página de cada peça, favoritos e sacolinha. A cliente escolhe entre **Finalizar compra** (paga no site pelo Mercado Pago: Pix ou cartão em até 6x) ou **Pedir pelo WhatsApp**.
- **Painel** (`/admin`): só você entra. Cadastra peças com foto, nome e descrição pela IA, segunda foto com a peça sendo usada (IA), estoque, e vê os **pedidos pagos**.
- **Funções do servidor** (`functions/api/`): IA (Gemini), frete por CEP, criação do pagamento, confirmação do pagamento (baixa o estoque e manda e-mail).

| Serviço | Para que serve | Custo |
|---|---|---|
| Cloudflare Pages | deixa o site no ar | grátis |
| Supabase | peças, fotos e pedidos | grátis |
| Gemini (Google AI Studio) | descrições e fotos com IA | pago por uso (centavos) |
| Mercado Pago | recebe os pagamentos | taxa por venda |
| Resend | e-mail a cada venda | grátis até 3 mil e-mails/mês |
| Registro.br | domínio angelsemijoia.com.br | já pago |

---

## 1. Atualizar o banco (Supabase) — uma vez só

No Supabase, abra **Editor SQL**, cole todo o arquivo `supabase/atualizacao.sql` e clique em **Executar**. Ele cria: categoria Chokers, segunda foto, estoque, tabela de pedidos e a confirmação de pagamento.

## 2. Chaves que você vai precisar

Todas ficam **só com você**. Nunca mande por mensagem.

1. **Supabase, chave secreta**: Project Settings → API Keys → *Secret keys*.
2. **Gemini**: aistudio.google.com → Get API key.
3. **Mercado Pago**: crie a conta de vendedor com seu CNPJ. Depois, em **Suas integrações → Criar aplicação → Credenciais**, copie o **Access Token**. Para testar, use as **credenciais de teste**. Para vender de verdade, as **de produção**.
4. **Resend**: crie a conta em resend.com **com o e-mail angelsemijoias83@gmail.com** e copie a API Key.

## 3. Testar no computador

1. Na pasta do projeto, abra o arquivo **`.dev.vars`** no Bloco de Notas e cole as chaves depois do `=` de cada linha. Salve.
2. Abra o terminal nesta pasta e rode:

   ```bash
   npm run local
   ```

3. Abra **http://127.0.0.1:8788** (loja) e **http://127.0.0.1:8788/admin** (painel).

As peças que você cadastrar no teste vão para o banco de verdade.

Com as credenciais de **teste** do Mercado Pago, use os cartões de teste da página de credenciais. Nenhum dinheiro é cobrado.

## 4. Colocar no ar (Cloudflare)

1. Crie a conta grátis em **cloudflare.com**.
2. **Workers & Pages → Create → Pages → Connect to Git** → escolha o repositório **siteloja**.
3. Configuração: *Framework preset* **None**, *Build command* **vazio**, *Build output directory* **public**.
4. Em **Settings → Variables and Secrets**, adicione as mesmas chaves do `.dev.vars`, usando as de **produção** do Mercado Pago.
5. **Custom domains** → adicione `angelsemijoia.com.br`. O Cloudflare mostra 2 servidores DNS para colocar no Registro.br.

## 5. Ajustes do dia a dia

- **Frete**: valores por estado em `functions/_lib/loja.js`. Hoje: SP R$ 15, Sul/Sudeste R$ 22, demais R$ 30, grátis acima de R$ 199.
- **Textos, contatos, CNPJ, parcelas**: `public/config.js`.
- **Estoque**: no painel, campo **Estoque** de cada peça. Vazio = não controla. Vendas pagas no site descontam sozinhas. Vendas no WhatsApp ou em mãos, ajuste no painel.
- **Pedidos**: no painel, em **Pedidos do site**. Depois de postar, coloque o rastreio e toque em **Marcar como enviado**.
- **E-mail para a cliente**: o Mercado Pago já manda o comprovante. Para o site também mandar e-mail para a cliente, verifique o domínio no Resend e preencha `EMAIL_REMETENTE`.
