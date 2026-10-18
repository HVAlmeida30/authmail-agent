import { adminDb } from './admin';

export async function authenticated(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
  if (!match) return null;
  // getUser consulta o serviço Auth e valida a sessão, sem confiar em dados do cliente.
  const { data, error } = await adminDb().auth.getUser(match[1]);
  if (error || !data.user || !data.user.email_confirmed_at) return null;
  return data.user;
}
