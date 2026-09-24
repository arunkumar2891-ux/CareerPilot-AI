/**
 * Credential resolution precedence.
 *
 * Pins the fix for the audit finding where a platform-wide `APIFY_TOKEN`
 * overrode every user's own connected Apify credential, pooling all tenants'
 * scrape quota, billing, and run history into one account.
 */
import { getSecretOrIntegration } from './credentials.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg ?? 'mismatch'}\n  actual:   ${actual}\n  expected: ${expected}`);
  }
}

const ENV_KEY = 'TEST_SHARED_TOKEN';

Deno.test("the user's own credential wins over the global secret", () => {
  Deno.env.set(ENV_KEY, 'platform-wide-token');
  try {
    assertEquals(
      getSecretOrIntegration(ENV_KEY, { token: 'user-own-token' }),
      'user-own-token',
      'global secret shadowed the per-user credential',
    );
  } finally {
    Deno.env.delete(ENV_KEY);
  }
});

Deno.test('the apiKey alias also wins over the global secret', () => {
  Deno.env.set(ENV_KEY, 'platform-wide-token');
  try {
    assertEquals(
      getSecretOrIntegration(ENV_KEY, { apiKey: 'user-own-key' }),
      'user-own-key',
    );
  } finally {
    Deno.env.delete(ENV_KEY);
  }
});

Deno.test('the global secret is still used when the user has no credential', () => {
  Deno.env.set(ENV_KEY, 'platform-wide-token');
  try {
    assertEquals(getSecretOrIntegration(ENV_KEY, {}), 'platform-wide-token');
  } finally {
    Deno.env.delete(ENV_KEY);
  }
});

Deno.test('an empty per-user value falls through to the global secret', () => {
  Deno.env.set(ENV_KEY, 'platform-wide-token');
  try {
    assertEquals(getSecretOrIntegration(ENV_KEY, { token: '' }), 'platform-wide-token');
  } finally {
    Deno.env.delete(ENV_KEY);
  }
});

Deno.test('returns empty string when neither source has a value', () => {
  Deno.env.delete(ENV_KEY);
  assertEquals(getSecretOrIntegration(ENV_KEY, {}), '');
});

Deno.test('honours a custom integration key', () => {
  Deno.env.delete(ENV_KEY);
  assertEquals(
    getSecretOrIntegration(ENV_KEY, { secret_key: 'scoped' }, 'secret_key'),
    'scoped',
  );
});
