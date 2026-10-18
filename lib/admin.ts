import { createClient } from '@supabase/supabase-js';

// Usado apenas por rotas server-side. Service role/secret nunca é enviado ao navegador.
export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase backend não configurado');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
