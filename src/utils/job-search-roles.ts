export function normalizeJobSearchRoles(roles: unknown, fallbackQuery?: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: unknown) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  if (Array.isArray(roles)) {
    for (const role of roles) push(role);
  }
  if (!out.length) push(fallbackQuery);
  return out;
}
