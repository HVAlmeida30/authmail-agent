export type AliasKind = 'temporary' | 'permanent';
export const TTL_OPTIONS = [15, 60, 1440, 10080] as const;
export function parseAliasRequest(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  if (payload.kind !== 'temporary' && payload.kind !== 'permanent') return null;
  const ttl = payload.kind === 'temporary' ? Number(payload.ttlMinutes) : null;
  if (payload.kind === 'temporary' && !TTL_OPTIONS.includes(ttl as typeof TTL_OPTIONS[number])) return null;
  if (payload.label != null && (typeof payload.label !== 'string' || payload.label.length > 80)) return null;
  const label = String(payload.label ?? '').trim();
  return { kind: payload.kind as AliasKind, ttlMinutes: ttl, label };
}
export function isAliasOpen(value: { is_active: boolean; expires_at: string | null }, now = Date.now()) {
  return value.is_active && (!value.expires_at || Date.parse(value.expires_at) > now);
}
export function canonicalDomain(value: string | undefined) {
  const domain = (value ?? '').trim().toLowerCase();
  return /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain) && !domain.includes('substitua') ? domain : null;
}
