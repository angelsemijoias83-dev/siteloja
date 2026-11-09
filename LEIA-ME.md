# Angel Semijoias: como colocar o site no ar

O site tem duas partes:

- **A loja** (`index.html`): o que as clientes veem. A sacolinha manda o pedido pronto para o seu WhatsApp.
- **O painel** (`admin.html`): só você entra, com e-mail e senha. Você escolhe a categoria, tira ou escolhe a foto, clica em **Gerar nome e descrição com IA**, confere o preço e salva. A peça aparece na loja na hora.

Você vai usar estas contas:

| Serviço | Para que serve | Custo |
|---|---|---|
| Supabase | guarda as fotos e os produtos | grátis |
| Google AI Studio (Gemini) | a IA que escreve as descrições | grátis no plano básico, com limite diário |
| GitHub | guarda os arquivos do site | grátis |
| Netlify | deixa o site no ar | grátis |
| Registro.br | o domínio angelsemijoia.com.br | R$ 76 por 2 anos |

---

## 1. Supabase (fotos e produtos)

1. Crie uma conta em **supabase.com** e clique em **New project**. Nome: `angel-semijoias`. Região: **South America (São Paulo)**. Anote a senha do banco.
2. No menu da esquerda, abra **SQL Editor**, cole todo o conteúdo do arquivo `supabase/setup.sql` e clique em **Run**.
3. Abra **Authentication → Users → Add user → Create new user**. Coloque seu e-mail e uma senha forte, marque **Auto Confirm User** e salve. É com esse login que você entra no painel.
4. **Importante:** abra **Authentication → Sign In / Providers** e **desligue "Allow new users to sign up"**. Assim ninguém mais consegue criar conta no seu painel.
5. Abra **Project Settings → API** e copie dois valores: **Project URL** e a chave **anon public**.
6. No arquivo `config.js`, cole esses dois valores e troque o WhatsApp e o Instagram pelos seus.

## 2. Gemini (a IA)

1. Entre em **aistudio.google.com** com sua conta Google.
2. Clique em **Get API key → Create API key** e copie a chave.
3. Guarde em lugar seguro. **Não mande a chave por mensagem e não coloque no `config.js`**: ela vai só no Netlify (passo 4).

No plano grátis, o Google pode usar o que é enviado para melhorar os produtos dele. Para fotos de semijoias isso não costuma ser problema. Se um dia quiser evitar, é só ativar o faturamento no AI Studio.

## 3. GitHub (guardar os arquivos)

1. Crie uma conta em **github.com** e um repositório novo chamado `angel-semijoias` (pode ser privado).
2. Clique em **uploading an existing file** e arraste todos os arquivos e pastas deste projeto, **menos a pasta `node_modules`**. Clique em **Commit changes**.

## 4. Netlify (site no ar)

1. Entre em **netlify.com** com a sua conta do GitHub.
2. **Add new site → Import an existing project → GitHub** e escolha `angel-semijoias`. Deixe as opções como estão.
3. Antes de publicar, abra **Environment variables** e adicione três:
   - `GEMINI_API_KEY`: a chave do Gemini
   - `SUPABASE_URL`: o Project URL do Supabase
   - `SUPABASE_ANON_KEY`: a chave anon do Supabase
4. Clique em **Deploy**. Em um minuto o site fica no ar num endereço tipo `angel-semijoias.netlify.app`.

## 5. Seu domínio

1. Compre `angelsemijoia.com.br` no **registro.br**.
2. No Netlify, abra **Domain management → Add a domain** e digite o domínio.
3. O Netlify mostra os **servidores DNS** (ex.: `dns1.p01.nsone.net`). No Registro.br, abra o domínio, clique em **Alterar servidores DNS** e cole esses endereços.
4. Em algumas horas o site abre no seu domínio, já com cadeado (https).

## 6. Usando o painel

Abra `https://angelsemijoia.com.br/admin.html` (dá para salvar na tela inicial do celular).

1. Escolha a **categoria**, o **banho** e o **preço**.
2. Toque na caixa da foto e tire ou escolha a foto da peça. Fotos com fundo claro e boa luz ficam melhores.
3. Se quiser, escreva detalhes em **Detalhes para a IA** (ex.: "zircônia cristal, 45 cm").
4. Clique em **Gerar nome e descrição com IA**, revise o texto e clique em **Salvar peça**.

Na lista abaixo você pode **Editar**, **Esconder** (some da loja sem apagar, bom para peças esgotadas) ou **Apagar**.

## Quando mudar alguma coisa

Para trocar textos, cores ou contatos, edite o arquivo no GitHub (ícone de lápis). O Netlify atualiza o site sozinho em cerca de um minuto. As peças você muda direto pelo painel, sem mexer em arquivo nenhum.
