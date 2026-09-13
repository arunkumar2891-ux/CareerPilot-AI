/** Version comes from package.json at build time (see `__APP_VERSION__` in vite.config.ts). */
const RAW_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** ISO timestamp stamped when the bundle was built (see `__BUILD_TIME__` in vite.config.ts). */
const RAW_BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

/** `1.0.0` -> `v1`, `1.4.0` -> `v1.4`. Patch is unused; deployments bump the minor. */
function formatVersion(raw: string): string {
  const [major = '0', minor = '0'] = raw.split('.');
  return Number(minor) === 0 ? `v${major}` : `v${major}.${minor}`;
}

/**
 * `MMDD.HHmm` in UTC, e.g. `0913.1437`.
 *
 * This is what actually changes between deployments. `package.json` only moves
 * when someone runs `npm run version:bump`, and a Render build cannot bump it
 * itself (shallow clone, and the container cannot commit) — so the build clock
 * is the one reliably monotonic signal. UTC keeps it stable regardless of the
 * build host's timezone.
 */
function formatBuildStamp(raw: string): string {
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  return `${month}${day}.${hours}${minutes}`;
}

export const APP_VERSION = formatVersion(RAW_VERSION);

export const APP_BUILD_STAMP = formatBuildStamp(RAW_BUILD_TIME);

/** Full ISO build time, for tooltips and support requests. */
export const APP_BUILD_TIME = RAW_BUILD_TIME;

/** e.g. `beta v1.1 · 0913.1437`. Falls back to `beta v1.1` if no stamp exists. */
export const APP_VERSION_LABEL = APP_BUILD_STAMP
  ? `beta ${APP_VERSION} · ${APP_BUILD_STAMP}`
  : `beta ${APP_VERSION}`;
