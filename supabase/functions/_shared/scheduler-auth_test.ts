import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkSchedulerAuth } from './scheduler-auth.ts';

const ENV_KEY = 'WORKFLOW_SCHEDULER_SECRET';

function request(auth?: string): Request {
  return new Request('https://example.test/functions/v1/workflow-step', {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
  });
}

Deno.test('refuses when the secret is not configured (previously failed open)', async () => {
  Deno.env.delete(ENV_KEY);
  const denied = checkSchedulerAuth(request());
  assertEquals(denied?.status, 503);
  const body = await denied!.json();
  assertEquals(typeof body.error, 'string');
});

Deno.test('refuses an unauthenticated caller even with no secret set', () => {
  Deno.env.delete(ENV_KEY);
  // The dangerous case: before the fix this returned null (authorized).
  assertEquals(checkSchedulerAuth(request()) === null, false);
});

Deno.test('rejects a missing Authorization header', () => {
  Deno.env.set(ENV_KEY, 'top-secret');
  assertEquals(checkSchedulerAuth(request())?.status, 401);
});

Deno.test('rejects a wrong secret', () => {
  Deno.env.set(ENV_KEY, 'top-secret');
  assertEquals(checkSchedulerAuth(request('Bearer wrong'))?.status, 401);
});

Deno.test('rejects a bare secret without the Bearer scheme', () => {
  Deno.env.set(ENV_KEY, 'top-secret');
  assertEquals(checkSchedulerAuth(request('top-secret'))?.status, 401);
});

Deno.test('authorizes the configured secret', () => {
  Deno.env.set(ENV_KEY, 'top-secret');
  assertEquals(checkSchedulerAuth(request('Bearer top-secret')), null);
});
