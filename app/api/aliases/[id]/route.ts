import { authenticated } from '@/lib/auth';
import { adminDb } from '@/lib/admin';
import { failure, json } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{id: string}> }) {
  try {
    const user = await authenticated(request);
    if (!user) return failure('Não autorizado.', 401);
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return failure('ID inválido.', 400);
    const { data, error } = await adminDb().from('authmail_aliases')
      .update({is_active:false}).eq('id', id).eq('owner_id', user.id)
      .select('id,address,is_active').maybeSingle();
    if (error) throw error;
    if (!data) return failure('Endereço não encontrado.', 404);
    return json({ alias: data });
  } catch { return failure('Falha ao desativar endereço.', 500); }
}
