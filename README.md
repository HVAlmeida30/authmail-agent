# AuthMail Agent — MVP v1.0

Aplicação web responsiva (Next.js 16 + TypeScript) que gera **aliases de recebimento** temporários e permanentes, recebe e-mails via Resend, extrai códigos OTP e oferece painel privado com Supabase Auth/PostgreSQL.

> **Importante:** endereços criados são aliases em um domínio de recebimento. **Não** são contas Google/Gmail, não podem enviar e-mails neste MVP e não dispensam CAPTCHA, SMS, telefone ou verificações adicionais exigidas por serviços terceiros. Use somente para cadastros e autenticações autorizados. Não há criação automatizada de contas em serviços externos.

## Entregue

- Cadastro/login com confirmação do e-mail principal pelo Supabase Auth.
- Gerador com nome opcional e tempo de 15min, 1h, 24h e 7d, ou permanente.
- Domínio configurável com roteamento dinâmico (`a<random>@dominio`) e controle de expirados/inativos.
- Proteção por usuário em **todas as rotas**; tabelas com RLS de leitura própria.
- Limites transacionais no banco: **20 criações/24h** e **50 endereços simultaneamente ativos**, por usuário.
- Verificação criptográfica dos webhooks Resend (Svix) usando corpo bruto.
- `email.received` → Resend Receiving GET → gravação idempotente no banco → OTP regex.
- Interface que **não executa HTML** de mensagens; caixa de texto simples.
- Painel com listagem, seleção, cópia, desativação e atualização de mensagens.
- Atualização automática a cada 15s quando a aba está visível; 50 últimas mensagens por alias.

## Dependências externas

1. **Projeto Supabase novo e exclusivo**, distinto de ImobPro e ZapOS.
2. **Conta Resend** com `Receiving` ativado e domínio de recebimento (domínio próprio/subdomínio ou domínio `.resend.app` disponibilizado pelo Resend).
3. **Hospedagem HTTPs** (Vercel ou similar) para webhook, `https://SEU_HOST/api/webhooks/resend`.
4. Node.js 20.9+ e npm para desenvolvimento.

## Instalação

```bash
npm install
cp .env.example .env.local
# Preencha somente no seu computador ou no painel de variáveis de ambiente do hosting.
npm run dev
```

Abra `http://localhost:3000`.

**Sem `.env.local` configurado a aplicação não conecta ao Supabase nem recebe e-mails.** Não inclua segredos no Git.

## Criar o banco e habilitar login

1. Crie um **Supabase project novo**, dedicado ao AuthMail.
2. No SQL Editor desse projeto novo, execute o conteúdo integral de `db/schema.sql`. Revise o destino antes de executar.
3. Em Authentication → Providers, habilite Email e configure a confirmação de e-mail; para produção configure SMTP apropriado, URL do site e URLs de redirecionamento.
4. Em Project Settings / Connect, obtenha a URL, a chave **publishable** e uma **secret** key. Nunca utilize secret key no frontend.
5. Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`.

> A aplicação confia no token somente após validar `auth.getUser(access_token)` no servidor. O RPC `authmail_create_alias` é executável apenas com `service_role`. Usuários comuns não recebem direitos de INSERT/UPDATE no banco.

## Configurar domínio de recebimento

1. No Resend, abra **Receiving**. Use um endereço de recebimento da equipe sob `.resend.app` ou adicione um **subdomínio** próprio com recebimento e MX configurados pelo Resend. Se seu domínio principal recebe e-mails por outro serviço, **não mude o MX principal** — use subdomínio para evitar interrupções.
2. Copie apenas o domínio em `AUTHMAIL_DOMAIN` (não inclua `@` nem endereço individual). Exemplo hipotético: `r9p8a.resend.app`.
3. Cadastre a API key Resend como `RESEND_API_KEY`, exclusiva para esse projeto se possível.
4. Publique a aplicação via HTTPS no Vercel (ou outro host com funções Next.js).
5. Em Resend → Webhooks, crie webhook para `https://SEU_HOST/api/webhooks/resend`, evento **`email.received`**.
6. Copie o segredo de **assinatura** do webhook para `RESEND_WEBHOOK_SECRET`. Não confunda com a API key.
7. Crie um alias na aplicação e envie um e-mail de teste de um endereço próprio para ele. Observe a mensagem na caixa em até 15s após a entrega.

**Atenção:** um domínio genérico `@gmail.com` não pode ser gerado por este sistema. São aliases de um domínio que você controla ou que o provedor disponibiliza.

## Rotas

| Método e rota | Autenticação | Função |
| --- | --- | --- |
| `GET /api/health` | pública | Health leve (não testa serviços externos) |
| `GET /api/aliases` | Bearer Supabase | Lista endereços próprios |
| `POST /api/aliases` | Bearer Supabase | Cria alias (limites atômicos no banco) |
| `PATCH /api/aliases/:id` | Bearer Supabase | Desativa alias próprio |
| `GET /api/aliases/:id/messages` | Bearer Supabase | Lista até 50 mensagens do alias próprio |
| `POST /api/webhooks/resend` | Assinatura Svix | Recebe evento, obtém conteúdo e armazena |

Payload de criação:

```json
{"kind":"temporary","ttlMinutes":60,"label":"Meu teste"}
```

Para permanente:

```json
{"kind":"permanent","label":"Meu login"}
```

## Testes

```bash
npm test
npm run typecheck
npm run build
```

Os testes unitários de `lib/otp.ts` e `lib/alias.ts` rodam com Node 22 sem baixar pacotes. `typecheck` e `build` exigem `npm install` e não substituem testes de integração externos. Para homologação, testar: cadastro com confirmação, dois usuários isolados, cada validade, alias desativado/expirado, webhook assinatura inválida, webhook duplicado, falha temporária na API Resend e webhook de múltiplos destinatários.

## Limitações / próxima etapa antes de produção

- **Não há envio de mensagens**, anexos, encaminhamento nem provisionamento de contas reais por API de provedores.
- OTP por **regras locais**, não por modelo generativo; revisar códigos manualmente em e-mails não reconhecidos.
- Expiração é aplicada na consulta de webhook, mas **não há exclusão física programada** de mensagens antigas. Antes do uso contínuo configure política de retenção e rotina de limpeza/backup com observabilidade.
- Sem rate limiter de IP na aplicação; limite de criação no banco. Antes de abrir ao público, adicione proteção de borda/WAF, CAPTCHA no signup se necessário e restrição de usuários permitidos.
- Resend e Vercel estão sujeitos a cotas e custos dos planos contratados.
- **Sem teste end-to-end do Resend/Supabase** até serem fornecidos os serviços e o domínio real.

## Segurança operacional

Ative MFA em contas administrativas dos provedores. Não exponha `SUPABASE_SECRET_KEY`, `RESEND_API_KEY` ou `RESEND_WEBHOOK_SECRET` em repositório, logs, cliente web ou respostas HTTP. Mantenha HTTPS, evite coletar dados sensíveis desnecessários e ative exclusão periódica/retention policy antes da produção, conforme LGPD e suas necessidades.
