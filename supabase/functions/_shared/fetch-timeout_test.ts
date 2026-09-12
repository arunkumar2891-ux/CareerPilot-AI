import { fetchJsonChecked } from './fetch-timeout.ts';

function stubFetch(handler: () => Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(handler());
  return () => {
    globalThis.fetch = original;
  };
}

async function expectThrow(fn: () => Promise<unknown>, check: (msg: string) => boolean, label: string) {
  let message = '';
  try {
    await fn();
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  if (!message) throw new Error(`${label}: expected throw, got success`);
  if (!check(message)) throw new Error(`${label}: unexpected message: ${message}`);
}

Deno.test('fetchJsonChecked throws descriptive error on HTML error page (no cryptic JSON parse error)', async () => {
  const restore = stubFetch(() => new Response('<html> <head><title>502 Bad Gateway</title></head></html>', { status: 502 }));
  try {
    await expectThrow(
      () => fetchJsonChecked('https://api.apify.com/v2/acts/x/runs/y?token=z', {}, 5000, 'Apify status check'),
      (msg) => msg.includes('HTTP 502') && msg.includes('HTML error page') && !/Unexpected token/.test(msg),
      'html-502',
    );
  } finally {
    restore();
  }
});

Deno.test('fetchJsonChecked throws descriptive error on non-JSON 200 response', async () => {
  const restore = stubFetch(() => new Response('<html>OK-ish but not JSON</html>', { status: 200 }));
  try {
    await expectThrow(
      () => fetchJsonChecked('https://api.apify.com/v2/datasets/abc/items?token=z', {}, 5000, 'Apify dataset fetch'),
      (msg) => msg.includes('invalid JSON') && msg.includes('HTTP 200') && !/Unexpected token/.test(msg),
      'html-200',
    );
  } finally {
    restore();
  }
});

Deno.test('fetchJsonChecked includes body snippet for non-HTML error responses', async () => {
  const restore = stubFetch(() => new Response('{"error":{"message":"Invalid token"}}', { status: 401 }));
  try {
    await expectThrow(
      () => fetchJsonChecked('https://api.apify.com/v2/acts/x/runs', {}, 5000, 'Apify start run'),
      (msg) => msg.includes('HTTP 401') && msg.includes('Invalid token'),
      'json-401',
    );
  } finally {
    restore();
  }
});

Deno.test('fetchJsonChecked parses valid JSON success responses', async () => {
  const restore = stubFetch(() => new Response('{"data":{"status":"SUCCEEDED"}}', { status: 200 }));
  try {
    const json = await fetchJsonChecked<{ data?: { status?: string } }>(
      'https://api.apify.com/v2/acts/x/runs/y?token=z',
      {},
      5000,
      'Apify status check',
    );
    if (json.data?.status !== 'SUCCEEDED') throw new Error(JSON.stringify(json));
  } finally {
    restore();
  }
});
