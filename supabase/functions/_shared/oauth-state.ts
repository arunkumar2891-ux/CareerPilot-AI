/**
 * Signed, time-limited OAuth `state` tokens.
 *
 * The Google OAuth callback is a bare browser redirect: it carries no
 * `Authorization` header and so cannot authenticate its caller. It therefore
 * has to trust `state` for the user's identity, which makes `state`
 * security-critical rather than bookkeeping.
 *
 * Before this module, `google-oauth-start` emitted `btoa(JSON.stringify({
 * userId }))` and the callback read it back with `atob`. Plain base64 is an
 * encoding, not a signature, so anyone could mint `btoa('{"userId":"<victim>"}')`,
 * complete Google consent with their *own* account, and have their tokens
 * written into the victim's `integrations` row. The granted scopes include
 * `gmail.send`, which auto-apply uses to send real email, so that was a
 * cross-tenant credential-injection primitive — and it also destroyed the
 * victim's own refresh token.
 *
 * `state` is now HMAC-SHA256 signed. The signing secret never leaves the
 * server, so a `userId` that survives `verifyOAuthState()` provably came from
 * `google-oauth-start`, which *does* authenticate the session.
 */

/**
 * How long a consent flow may take. Long enough for a real user to pick an
 * account and read the scope list, short enough to bound replay of a captured
 * `state`.
 */
const STATE_TTL_MS = 10 * 60 * 1000;

/** Tolerance for clock skew between the signing and verifying isolates. */
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

/**
 * Resolve the HMAC key.
 *
 * `OAUTH_STATE_SECRET` is preferred, but the service-role key is always
 * present in an Edge Function environment (`supabase-admin.ts` depends on it),
 * so signing works with no new configuration. That matters: a fix that needs a
 * new secret set before it works would silently leave the forgery path open
 * until someone remembered to set it.
 */
function stateSecret(): string {
  const secret = Deno.env.get('OAUTH_STATE_SECRET') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('oauth_state_secret_missing');
  return secret;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return new Uint8Array(signature);
}

/**
 * Length-independent, constant-time comparison. A plain `===` on the encoded
 * signature would leak how many leading bytes matched via timing, which is
 * enough to forge a signature one byte at a time.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Mint a signed `state` for an already-authenticated user. */
export async function signOAuthState(userId: string, now = Date.now()): Promise<string> {
  if (!userId) throw new Error('oauth_state_user_missing');
  const payload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify({ userId, iat: now })),
  );
  const signature = encodeBase64Url(await hmac(payload, stateSecret()));
  return `${payload}.${signature}`;
}

/**
 * Verify a `state` and return the user id it was minted for.
 *
 * Throws on any failure. Callers must treat a throw as "do not write anything"
 * — there is deliberately no lenient path and no fallback to the old unsigned
 * format, because accepting a legacy token would leave the forgery open.
 */
export async function verifyOAuthState(
  state: string,
  now = Date.now(),
): Promise<{ userId: string }> {
  const parts = state.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('oauth_state_invalid');
  const [payload, signature] = parts;

  let provided: Uint8Array;
  try {
    provided = decodeBase64Url(signature);
  } catch {
    throw new Error('oauth_state_invalid');
  }

  const expected = await hmac(payload, stateSecret());
  if (!timingSafeEqual(expected, provided)) throw new Error('oauth_state_invalid');

  // Only parse the payload once the signature is known good, so malformed
  // input from an unauthenticated caller never reaches JSON.parse.
  let parsed: { userId?: unknown; iat?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
  } catch {
    throw new Error('oauth_state_invalid');
  }

  const { userId, iat } = parsed;
  if (typeof userId !== 'string' || !userId) throw new Error('oauth_state_invalid');
  if (typeof iat !== 'number' || !Number.isFinite(iat)) throw new Error('oauth_state_invalid');
  if (now - iat > STATE_TTL_MS) throw new Error('oauth_state_expired');
  if (iat - now > CLOCK_SKEW_TOLERANCE_MS) throw new Error('oauth_state_invalid');

  return { userId };
}
