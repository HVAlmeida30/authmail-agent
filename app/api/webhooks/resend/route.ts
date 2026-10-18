import { Resend } from 'resend';
import { adminDb } from '@/lib/admin';
import { canonicalDomain, isAliasOpen } from '@/lib/alias';
import { extractOtp, textFromEmail } from '@/lib/otp';
import { failure, json } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type InboundEvent = { type: string; data?: { email_id?: string; to?: string[] } };

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const domain = canonicalDomain(process.env.AUTHMAIL_DOMAIN);
  if (!apiKey || !webhookSecret || !domain) return failure('Webhook não configurado.', 503);
  const raw = await request.text();
  if (raw.length > 100000) return failure('Requisição muito grande.', 413);
  const resend = new Resend(apiKey);
  let event: InboundEvent;
  try {
    event = resend.webhooks.verify({
      payload: raw,
      headers: {
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? ''
      },
      webhookSecret
    }) as InboundEvent;
  } catch { return failure('Assinatura inválida.', 400); }
  if (event.type !== 'email.received') return json({ ok: true });
  if (!event.data?.email_id) return failure('Evento incompleto.', 400);

  try {
    const recipients = [...new Set((event.data.to ?? [])
      .map(address => address.trim().toLowerCase())
      .filter(address => address.endsWith(`@${domain}`)))].slice(0, 30);
    if (!recipients.length) return json({ ok: true });
    const db = adminDb();
    const { data: aliases, error: lookupError } = await db.from('authmail_aliases')
      .select('id,address,owner_id,is_active,expires_at')
      .in('address', recipients);
    if (lookupError) throw lookupError;
    const active = (aliases ?? []).filter(isAliasOpen);
    if (!active.length) return json({ ok: true });

    // O evento do Resend não contém o corpo; recuperamos via API depois da validação.
    const { data: email, error: receivingError } = await resend.emails.receiving.get(event.data.email_id);
    if (receivingError || !email) throw new Error('Resend receiving.get indisponível');
    const body = textFromEmail(email.text, email.html);
    const code = extractOtp(`${email.subject ?? ''}\n${body}`);
    const fromAddress = String(email.from ?? '').slice(0, 320);
    const subject = String(email.subject ?? '(sem assunto)').slice(0, 500);
    const rows = active.map(alias => ({
      alias_id: alias.id, owner_id: alias.owner_id,
      provider_email_id: event.data!.email_id!,
      from_address: fromAddress, subject, body_text: body,
      otp_code: code
    }));
    const { error: insertError } = await db.from('authmail_messages')
      .upsert(rows, { onConflict: 'alias_id,provider_email_id', ignoreDuplicates: true });
    if (insertError) throw insertError;
    return json({ ok: true });
  } catch {
    // Retornar 500 permite retry pelo Resend em caso de falha transitória.
    return failure('Falha temporária ao receber e-mail.', 500);
  }
}
