import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { signOAuthState, verifyOAuthState } from './oauth-state.ts';

// `stateSecret()` falls back to the service-role key, which the test env sets.
Deno.env.set('OAUTH_STATE_SECRET', 'test-signing-secret');

Deno.test('signOAuthState round-trips the user id', async () => {
  const state = await signOAuthState('user-abc');
  const { userId } = await verifyOAuthState(state);
  assertEquals(userId, 'user-abc');
});

Deno.test('state is not plain base64 JSON', async () => {
  const state = await signOAuthState('user-abc');
  // Two dot-separated segments: payload and signature.
  assertEquals(state.split('.').length, 2);
});

Deno.test('rejects a forged unsigned state (the original vulnerability)', async () => {
  // Exactly what google-oauth-start used to emit, and what an attacker could
  // trivially mint for any victim user id.
  const forged = btoa(JSON.stringify({ userId: 'victim-user-id' }));
  await assertRejects(() => verifyOAuthState(forged), Error, 'oauth_state_invalid');
});

Deno.test('rejects a state whose payload was swapped for another user', async () => {
  const legit = await signOAuthState('attacker-user');
  const signature = legit.split('.')[1];
  const swapped = btoa(JSON.stringify({ userId: 'victim-user', iat: Date.now() }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await assertRejects(
    () => verifyOAuthState(`${swapped}.${signature}`),
    Error,
    'oauth_state_invalid',
  );
});

Deno.test('rejects a state signed with a different secret', async () => {
  const state = await signOAuthState('user-abc');
  Deno.env.set('OAUTH_STATE_SECRET', 'a-different-secret');
  try {
    await assertRejects(() => verifyOAuthState(state), Error, 'oauth_state_invalid');
  } finally {
    Deno.env.set('OAUTH_STATE_SECRET', 'test-signing-secret');
  }
});

Deno.test('rejects an expired state', async () => {
  const issued = Date.now() - 11 * 60 * 1000;
  const state = await signOAuthState('user-abc', issued);
  await assertRejects(() => verifyOAuthState(state), Error, 'oauth_state_expired');
});

Deno.test('accepts a state still inside the TTL', async () => {
  const issued = Date.now() - 5 * 60 * 1000;
  const state = await signOAuthState('user-abc', issued);
  const { userId } = await verifyOAuthState(state);
  assertEquals(userId, 'user-abc');
});

Deno.test('rejects a far-future state', async () => {
  const state = await signOAuthState('user-abc', Date.now() + 10 * 60 * 1000);
  await assertRejects(() => verifyOAuthState(state), Error, 'oauth_state_invalid');
});

Deno.test('rejects malformed states without throwing a parse error', async () => {
  for (const bad of ['', '.', 'nodot', 'a.', '.b', 'a.b', 'not-base64!.sig']) {
    await assertRejects(() => verifyOAuthState(bad), Error);
  }
});

Deno.test('signOAuthState rejects an empty user id', async () => {
  await assertRejects(() => signOAuthState(''), Error, 'oauth_state_user_missing');
});
