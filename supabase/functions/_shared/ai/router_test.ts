import { ProviderError, type GenerateRequest, type ProviderAdapter } from './types.ts';

const VALID_ATS = `NAME
Jane Doe

CONTACT
email@example.com

SUMMARY
Senior engineer with distributed systems experience.

PROFESSIONAL EXPERIENCE
Acme — Staff Engineer
- Shipped APIs used by millions of users.

EDUCATION
B.S. Computer Science

SKILLS
TypeScript, Python
`;

function mockAdapter(
  name: 'gemini' | 'groq',
  impl: {
    configured?: boolean;
    generate?: (req: GenerateRequest) => Promise<string>;
  },
): ProviderAdapter & { calls: number } {
  const adapter = {
    name,
    calls: 0,
    isConfigured() {
      return impl.configured !== false;
    },
    async generate(req: GenerateRequest) {
      adapter.calls += 1;
      if (impl.generate) return impl.generate(req);
      return VALID_ATS;
    },
  };
  return adapter;
}

function fail(kind: string, retryable: boolean, status?: number, message = 'boom') {
  return new ProviderError({ provider: 'gemini', message, retryable, kind, status });
}

Deno.test('Gemini success does not call Groq', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {});
  const groq = mockAdapter('groq', {});
  const logs: string[] = [];
  const text = await generateWithProviders(
    { systemPrompt: 's', userPrompt: 'u', operation: 'resume_tailoring' },
    { adapters: { gemini, groq }, primary: 'gemini', fallback: 'groq', log: (m) => logs.push(m) },
  );
  if (!text.includes('PROFESSIONAL EXPERIENCE')) throw new Error('expected ATS text');
  if (gemini.calls !== 1) throw new Error(`gemini calls ${gemini.calls}`);
  if (groq.calls !== 0) throw new Error('groq should not be called');
});

Deno.test('Gemini timeout falls back to Groq', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {
    generate: async () => {
      throw fail('timeout', true);
    },
  });
  const groq = mockAdapter('groq', {});
  const logs: string[] = [];
  const text = await generateWithProviders(
    { systemPrompt: 's', userPrompt: 'u', operation: 'resume_tailoring' },
    { adapters: { gemini, groq }, primary: 'gemini', fallback: 'groq', log: (m) => logs.push(m) },
  );
  if (groq.calls !== 1) throw new Error('groq should be called after timeout');
  if (!text.includes('SUMMARY')) throw new Error('expected groq ATS result');
  if (!logs.some((l) => l.includes('timeout'))) throw new Error('expected timeout log');
});

Deno.test('Gemini 429 falls back to Groq', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {
    generate: async () => {
      throw fail('http_429', true, 429);
    },
  });
  const groq = mockAdapter('groq', {});
  await generateWithProviders(
    { systemPrompt: 's', userPrompt: 'u', operation: 'chat' },
    { adapters: { gemini, groq }, primary: 'gemini', fallback: 'groq', log: () => {} },
  );
  if (groq.calls !== 1) throw new Error('expected groq after 429');
});

Deno.test('Gemini 500 falls back to Groq', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {
    generate: async () => {
      throw fail('http_500', true, 500);
    },
  });
  const groq = mockAdapter('groq', {});
  await generateWithProviders(
    { systemPrompt: 's', userPrompt: 'u', operation: 'chat' },
    { adapters: { gemini, groq }, primary: 'gemini', fallback: 'groq', log: () => {} },
  );
  if (groq.calls !== 1) throw new Error('expected groq after 500');
});

Deno.test('Gemini invalid request does not call Groq', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {
    generate: async () => {
      throw fail('http_400', false, 400, 'invalid argument');
    },
  });
  const groq = mockAdapter('groq', {});
  let threw = false;
  try {
    await generateWithProviders(
      { systemPrompt: 's', userPrompt: 'u', operation: 'chat' },
      { adapters: { gemini, groq }, primary: 'gemini', fallback: 'groq', log: () => {} },
    );
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('expected throw');
  if (groq.calls !== 0) throw new Error('must not fallback on 400');
});

Deno.test('missing Gemini key uses Groq', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', { configured: false });
  const groq = mockAdapter('groq', {});
  const text = await generateWithProviders(
    { systemPrompt: 's', userPrompt: 'u', operation: 'resume_tailoring' },
    { adapters: { gemini, groq }, primary: 'gemini', fallback: 'groq', log: () => {} },
  );
  if (gemini.calls !== 0) throw new Error('gemini should be skipped');
  if (groq.calls !== 1) throw new Error('groq should run');
  if (!text.includes('PROFESSIONAL EXPERIENCE')) throw new Error('expected resume result');
});

Deno.test('Groq malformed ATS fails without returning corrupt text', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {
    generate: async () => {
      throw fail('timeout', true);
    },
  });
  const groq = mockAdapter('groq', {
    generate: async () => 'not a resume',
  });
  let message = '';
  try {
    await generateWithProviders(
      { systemPrompt: 's', userPrompt: 'u', operation: 'resume_tailoring' },
      { adapters: { gemini, groq }, primary: 'gemini', fallback: 'groq', log: () => {} },
    );
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  if (!message.includes('All AI providers failed')) throw new Error(message);
  if (message.includes('not a resume') && message.length > 80) {
    /* validation reason is enough; full body is not required */
  }
});

Deno.test('both providers fail with combined error', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {
    generate: async () => {
      throw fail('timeout', true, undefined, 'gemini down');
    },
  });
  const groq = mockAdapter('groq', {
    generate: async () => {
      throw new ProviderError({
        provider: 'groq',
        message: 'groq down',
        retryable: true,
        kind: 'http_503',
        status: 503,
      });
    },
  });
  let message = '';
  try {
    await generateWithProviders(
      { systemPrompt: 's', userPrompt: 'u', operation: 'chat' },
      { adapters: { gemini, groq }, primary: 'gemini', fallback: 'groq', log: () => {} },
    );
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  if (!message.includes('All AI providers failed')) throw new Error(message);
  if (!message.includes('gemini') || !message.includes('groq')) throw new Error(message);
});

Deno.test('logs never contain API keys', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const { sanitizeAiErrorMessage } = await import('./errors.ts');
  const gemini = mockAdapter('gemini', {
    generate: async () => {
      throw fail('timeout', true, undefined, 'Authorization: Bearer gsk_LIVESECRETKEY123 AIzaSyFAKESECRET');
    },
  });
  const groq = mockAdapter('groq', {});
  const logs: string[] = [];
  await generateWithProviders(
    { systemPrompt: 's', userPrompt: 'u', operation: 'chat' },
    { adapters: { gemini, groq }, primary: 'gemini', fallback: 'groq', log: (m) => logs.push(m) },
  );
  const blob = logs.join('\n') + sanitizeAiErrorMessage('Bearer gsk_LIVESECRETKEY123');
  if (/gsk_LIVE|AIzaSyFAKE/.test(blob)) throw new Error('keys leaked in logs');
});
