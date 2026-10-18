import { authenticated } from '@/lib/auth';
import { adminDb } from '@/lib/admin';
import { failure, json } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const user = await authenticated(request);
    if (!user) return failure('Não autorizado.', 401);
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return failure('ID inválido.', 400);
    const db = adminDb();
    const { data: alias, error: aliasError } = await db.from('authmail_aliases')
      .select('id').eq('id', id).eq('owner_id', user.id).maybeSingle();
    if (aliasError) throw aliasError;
    if (!alias) return failure('Caixa não encontrada.', 404);
    const { data, error } = await db.from('authmail_messages')
      .select('id,from_address,subject,body_text,otp_code,received_at')
      .eq('alias_id', id).eq('owner_id', user.id)
      .order('received_at', { ascending: false }).limit(50);
    if (error) throw error;
    return json({ messages: data ?? [] });
  } catch { return failure('Falha ao carregar mensagens.', 500); }
}
