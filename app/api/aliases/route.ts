import { authenticated } from '@/lib/auth';
import { adminDb } from '@/lib/admin';
import { canonicalDomain, parseAliasRequest } from '@/lib/alias';
import { failure, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await authenticated(request);
    if (!user) return failure('Sessão inválida ou e-mail de login não confirmado.', 401);
    const { data, error } = await adminDb().from('authmail_aliases')
      .select('id,address,kind,label,is_active,created_at,expires_at')
      .eq('owner_id', user.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return json({ aliases: data ?? [] });
  } catch { return failure('Não foi possível consultar os aliases.', 500); }
}

export async function POST(request: Request) {
  try {
    const user = await authenticated(request);
    if (!user) return failure('Sessão inválida ou e-mail de login não confirmado.', 401);
    if (!(request.headers.get('content-type') ?? '').includes('application/json')) return failure('Use JSON.', 415);
    const parsed = parseAliasRequest(await request.json());
    if (!parsed) return failure('Tipo, validade ou nome inválido.', 422);
    const domain = canonicalDomain(process.env.AUTHMAIL_DOMAIN);
    if (!domain) return failure('Domínio de recebimento não configurado.', 503);
    const { data, error } = await adminDb().rpc('authmail_create_alias', {
      p_owner: user.id, p_domain: domain, p_kind: parsed.kind,
      p_ttl_minutes: parsed.ttlMinutes, p_label: parsed.label
    });
    if (error) {
      if (error.code === 'P0001') return failure('Limite de aliases alcançado ou dados inválidos.', 429);
      throw error;
    }
    return json({ alias: data }, 201);
  } catch { return failure('Não foi possível criar o endereço.', 500); }
}
