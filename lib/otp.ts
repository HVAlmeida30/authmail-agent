/** Extrai códigos comuns, sem interpretar nem executar HTML ou links. */
export function extractOtp(input: string): string | null {
  const normalized = input.replace(/\u00a0/g, ' ').slice(0, 30000);
  // Exige contexto semântico de autenticação para reduzir falsos positivos.
  const patterns = [
    /(?:c[oó]digo(?:\s+(?:de|para)\s+(?:verifica[cç][aã]o|acesso|seguran[cç]a|autentica[cç][aã]o))?|verification\s+code|security\s+code|one[- ]time\s+(?:password|code)|otp|passcode)[^\d]{0,70}(\d(?:[\s-]?\d){3,7})(?!\d)/i,
    /(\d(?:[\s-]?\d){3,7})(?!\d)[^\n]{0,50}(?:is your (?:verification )?code|[eé]\s+seu\s+c[oó]digo)/i,
  ];
  for (const pattern of patterns) {
    const found = normalized.match(pattern);
    if (found) {
      const digits = found[1].replace(/\D/g, '');
      if (digits.length >= 4 && digits.length <= 8) return digits;
    }
  }
  return null;
}

/** Não renderizamos HTML original: mensagens permanecem texto simples. */
export function textFromEmail(text: string | null | undefined, html: string | null | undefined): string {
  if (text?.trim()) return text.slice(0, 40000);
  return (html ?? '')
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/\s*(?:script|style)\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .trim().slice(0, 40000);
}
