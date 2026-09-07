/** Version comes from package.json at build time (see `__APP_VERSION__` in vite.config.ts). */
const RAW_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** `1.0.0` -> `v1`, `1.4.0` -> `v1.4`. Patch is unused; deployments bump the minor. */
function formatVersion(raw: string): string {
  const [major = '0', minor = '0'] = raw.split('.');
  return Number(minor) === 0 ? `v${major}` : `v${major}.${minor}`;
}

export const APP_VERSION = formatVersion(RAW_VERSION);

export const APP_VERSION_LABEL = `beta ${APP_VERSION}`;
