export const RUN_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveRunIdLookup(input: string, knownIds: string[] = []): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (RUN_UUID_RE.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/-/g, '').toLowerCase();
  const matches = knownIds.filter((id) => {
    const lower = id.toLowerCase();
    return lower.startsWith(trimmed.toLowerCase()) || lower.replace(/-/g, '').startsWith(compact);
  });
  return matches.length === 1 ? matches[0] : null;
}

export function getRunLogsSql(runId: string): string {
  return `SELECT * FROM get_run_logs('${runId}'::uuid);`;
}

export function getRunObservabilitySql(runId: string): string {
  return `SELECT get_run_observability('${runId}'::uuid);`;
}
