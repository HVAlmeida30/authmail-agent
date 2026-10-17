# Arquitetura técnica — AuthMail Agent MVP

## Limites do sistema

```
[Navegador Next.js, publishable key]
        │ Login/registro no Supabase Auth
        │ Bearer access_token
        ▼
[Route Handlers Next.js no Vercel]
        │ auth.getUser(token) + autorização pelo owner_id
        │ service secret somente no servidor
        ▼
[PostgreSQL Supabase AuthMail isolado]
  ├─ authmail_aliases (tipo, validade, estado, proprietário)
  ├─ authmail_messages (mensagem plaintext, OTP, remetente)
  └─ authmail_create_alias (RPC de criação atômica, service_role only)

[Envio externo ao endereço alias@dominio]
        ▼
[Resend Receiving / MX do domínio]
        │ POST email.received assinado (metadados)
        ▼
[POST /api/webhooks/resend]
        ├─ valida assinatura e timestamp Svix (antes de usar o evento)
        ├─ valida domínio/aliases existentes e ativos
        ├─ GET email body via Resend SDK/Receiving
        ├─ converte HTML para texto simples (sem execução)
        ├─ extrai 4-8 dígitos com pistas de autenticação
        └─ insere com deduplicação (alias_id, provider_email_id)
```

## Regra de validade

- Temporários: 15, 60, 1440 ou 10080 minutos.
- Permanentes: `expires_at IS NULL`; continuam até `is_active = false`.
- Ao vencer, o banco preserva histórico, mas webhook deixa de gravar novos e-mails.
- Um alias desativado continua reservado na tabela e não é transferido a outro usuário.
- Para retenção/limpeza de mensagens: especificar uma política de prazo e job antes de produção.

## Modelo e autorização

- Cada endereço tem UUID, `owner_id` não editável pelo cliente, `address` único e normalizado, tipo, estado e prazo.
- Cada mensagem pertence ao mesmo `owner_id` do alias e é única por (alias, Resend email_id).
- RLS SELECT `owner_id = auth.uid()`; usuário logado não tem INSERT/UPDATE/DELETE nas tabelas.
- Mutação central é RPC atômico liberado **só ao service_role**, chamada pelo backend após token `auth.getUser` validado.
- Secret key e Resend API key devem permanecer fora do bundle do navegador.

## Segurança e abuso

- Token é revalidado a cada chamada API com `auth.getUser`; login não confirmado é rejeitado.
- RPC utiliza lock de transação por usuário, limita a 20 novos aliases nas últimas 24h e 50 ativos.
- Webhook requer assinatura, deduplica retry, rejeita destinatários fora do domínio próprio.
- O painel renderiza texto simples de mensagens, nunca HTML via `dangerouslySetInnerHTML`.
- Não há clique automático em links externos de verificação, nem envio automático de OTP a terceiros.
- É necessário proteger o signup contra abuso por terceiros e aplicar rate limit/WAF em produção.

## Etapas de homologação

| Caso | Esperado |
| --- | --- |
| Token ausente, inválido ou e-mail login não confirmado | 401 |
| Usuário A consulta mensagem de alias B | 404 |
| Criação de alias após 20/24h | 429 |
| Criação inválida com validade de 30 min | 422 |
| Webhook sem Svix válido | 400 e zero gravações |
| E-mail recebido por alias ativo | uma mensagem disponível para proprietário |
| Mesmo evento recebido duas vezes | uma linha apenas, sem duplicação |
| E-mail para alias desativado/expirado | zero novas mensagens |
| E-mail contendo HTML/script | texto renderizado, nenhum script executado |
| API Resend indisponível | 500 para retry |
| Usuário sai do aplicativo | acesso a endpoints retorna 401 após token revogado/expirado |

## Critérios de GO para disponibilização

1. Login/cadastro com confirmação funcionando no projeto isolado.
2. Envio externo real confirmado pelo Resend e webhook HTTPS assinado.
3. Cross-user isolation e cenário de assinatura inválida validados.
4. Domain receiving confirmado; sem conflito com MX do e-mail principal.
5. Limites/retention e proteção contra abuso revisados; secrets configurados exclusivamente no host.

Sem esses testes externos, a entrega é **base de código de MVP**, não um sistema de e-mail operacional validado em produção.
