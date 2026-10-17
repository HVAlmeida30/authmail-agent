# AuthMail Agent — Deploy de homologação na Vercel

## Situação verificada em 16/10/2026

- Conta Vercel conectada: `thehugob13` (Hobby).
- Workspace selecionado pela própria conta: `thehugob13s-projects`.
- A integração do ChatGPT recebeu resposta **HTTP 403, sem autorização para esse workspace**. Nenhum projeto nem deploy foi criado.
- Testes locais: `npm test` — 7/7 passando.
- `npm install`, `npm run typecheck` e `npm run build` não puderam ser concluídos nesta sessão porque o registro npm não resolveu (`EAI_AGAIN`). O deploy ainda precisa validar o build real.

## Desbloquear acesso Vercel no ChatGPT

1. No ChatGPT, abra **Configurações → Plugins** e localize **Vercel**.
2. Revise ou reconecte a integração, garantindo acesso ao workspace `thehugob13s-projects` e permissão de criar projetos e deployments.
3. Confirme que a conexão está autorizada no mesmo workspace no painel [Vercel](https://vercel.com/dashboard).
4. Depois, solicite novamente a criação de `authmail-agent-staging` em **Preview**, nunca Production nesta etapa.

Observação: permissões e nomes de menus podem variar. O erro apresentado pela API foi `403` por escopo de autorização; não é um erro do código Next.js.

## Publicar manualmente, caso prefira o painel

O pacote ZIP contém código-fonte e **não é** um executável que a Vercel aceite como instalação única. O fluxo Git recomendado:

1. Crie no GitHub um repositório privado chamado `authmail-agent`.
2. Extraia o pacote e envie o **conteúdo de `authmail-agent/` para a raiz** do repositório (com `package.json` na raiz). Não inclua `.env.local`.
3. Entre em [Vercel → Add New → Project](https://vercel.com/new), selecione o repositório e o workspace autorizado.
4. Configure **Project Name**: `authmail-agent-staging`; **Framework Preset**: Next.js; **Root Directory**: `./`.
5. Não configure domínio próprio de produção neste momento. Faça o primeiro deploy apenas para verificar build e página de configuração.
6. Crie a branch `staging` no GitHub e publique-a como **Preview Deployment**. Na Vercel, commits em `main` normalmente acionam Production; não use `main` para testes com segredos até revisar a configuração.
7. Verifique `GET /api/health`, que deverá devolver `{"service":"authmail-agent","status":"up"}` se o app estiver no ar.

## Variáveis de ambiente (Preview — somente depois de criar Supabase/Resend exclusivos)

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<projeto-exclusivo>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<chave-publica>
SUPABASE_SECRET_KEY=<chave-servidor>
RESEND_API_KEY=<chave-resend>
RESEND_WEBHOOK_SECRET=<segredo-assinatura-webhook>
AUTHMAIL_DOMAIN=<dominio-recebimento>
```

- Configurar em **Project Settings → Environment Variables**, com alvo **Preview**.
- As duas variáveis `NEXT_PUBLIC_` são públicas no navegador; **as demais são segredos de servidor**.
- Não copie segredos de ImobPro nem ZapOS. Nunca cole valores reais em GitHub, logs ou conversas.
- Como `NEXT_PUBLIC_` é compilada no bundle web do Next.js, faça **redeploy** após defini-la.
- Enquanto não houver variáveis reais, a aplicação pode exibir *Configuração inicial necessária*: isso é esperado, não significa que os serviços foram testados.

## Gate de homologação

1. Build `READY` e painel abrindo em URL Preview.
2. `/api/health` responde, sem confundir health superficial com conectividade Supabase/Resend.
3. Supabase exclusivo criado, banco migrado, Auth configurado e dois usuários isolados.
4. Resend Receiving ativo, domínio verificado, webhook assinado e `email.received` real verificado.
5. Aliases temporários/permanentes e expiração testados; desativados devem rejeitar mensagens novas.
6. Logs sem vazamento de tokens/códigos e com tratamento de mensagens duplicadas.
7. Somente depois homologação completa avaliar Production.

## Comandos opcionais na sua máquina (com Node.js e credenciais Vercel autorizadas)

```bash
cd authmail-agent
npm install
npm test
npm run typecheck
npm run build
npx vercel login
npx vercel link
npx vercel deploy
```

A instrução `vercel deploy` **sem `--prod`** cria deploy de Preview. Não execute `--prod` para esta etapa.

## Links oficiais

- https://vercel.com/docs/deployments/environments
- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/projects/deploy-from-cli
