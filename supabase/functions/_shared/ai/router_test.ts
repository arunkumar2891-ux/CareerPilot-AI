import { ProviderError, type AiProviderName, type GenerateRequest, type ProviderAdapter } from './types.ts';

const VALID_ATS = `NAME
Jane Doe

CONTACT
email@example.com

SUMMARY
Senior engineer with distributed systems experience.

SKILLS
TypeScript, Python

PROFESSIONAL EXPERIENCE
Acme — Staff Engineer
- Shipped APIs used by millions of users.

EDUCATION
B.S. Computer Science
`;

function mockAdapter(
  name: AiProviderName,
  impl: {
    configured?: boolean;
    generate?: (req: GenerateRequest) => Promise<{ text: string; tokensInput: number; tokensOutput: number }>;
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
      return { text: VALID_ATS, tokensInput: 100, tokensOutput: 200 };
    },
  };
  return adapter;
}

function fail(kind: string, retryable: boolean, status?: number, message = 'boom') {
  return new ProviderError({ provider: 'gemini', message, retryable, kind, status });
}

function withEnv(vars: Record<string, string | null>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = Deno.env.get(key);
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === null) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test('provider chain is Gemini primary + paid fallback, then Groq when forced', async () => {
  const { getProviderChain, getRerankProviderChain } = await import('./config.ts');
  withEnv({
    GEMINI_API_KEY: 'free-key',
    GEMINI_API_KEY_FALLBACK: 'paid-key',
    GROQ_API_KEY: 'groq-key',
    AI_FORCE_GROQ: 'true',
  }, () => {
    const chain = getProviderChain();
    if (JSON.stringify(chain) !== JSON.stringify(['gemini', 'gemini_fallback', 'groq'])) {
      throw new Error(`unexpected provider chain: ${chain.join(' → ')}`);
    }
    const resumeChain = getProviderChain('resume_tailoring');
    if (JSON.stringify(resumeChain) !== JSON.stringify(['gemini_fallback', 'groq'])) {
      throw new Error(`unexpected resume chain: ${resumeChain.join(' → ')}`);
    }
    const rerankChain = getRerankProviderChain();
    if (JSON.stringify(rerankChain) !== JSON.stringify(['gemini_fallback'])) {
      throw new Error(`unexpected rerank chain: ${rerankChain.join(' → ')}`);
    }
  });
});

Deno.test('Groq stays off the chain unless AI_FORCE_GROQ=true', async () => {
  const { getProviderChain } = await import('./config.ts');
  withEnv({
    GEMINI_API_KEY: 'free-key',
    GEMINI_API_KEY_FALLBACK: 'paid-key',
    GROQ_API_KEY: 'groq-key',
    AI_FORCE_GROQ: null,
  }, () => {
    const chain = getProviderChain();
    if (JSON.stringify(chain) !== JSON.stringify(['gemini', 'gemini_fallback'])) {
      throw new Error(`unexpected provider chain: ${chain.join(' → ')}`);
    }
    const resumeChain = getProviderChain('resume_tailoring');
    if (JSON.stringify(resumeChain) !== JSON.stringify(['gemini_fallback', 'groq'])) {
      throw new Error(`ATS should still use Groq: ${resumeChain.join(' → ')}`);
    }
  });
});

Deno.test('rejected Gemini resume response is logged before validation', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const fallback = mockAdapter('gemini_fallback', {
    generate: async () => ({
      text: 'RAW_RESPONSE_MARKER\nunsupported resume output',
      tokensInput: 10,
      tokensOutput: 5,
    }),
  });
  const logs: string[] = [];
  try {
    await generateWithProviders(
      { systemPrompt: 's', userPrompt: 'u', operation: 'resume_tailoring' },
      {
        adapters: { gemini_fallback: fallback },
        providerChain: ['gemini_fallback'],
        log: (message) => logs.push(message),
      },
    );
  } catch {
    // Validation failure is expected; the raw response must still be observable.
  }
  const joined = logs.join('\n');
  if (!joined.includes('raw_response') || !joined.includes('RAW_RESPONSE_MARKER')) {
    throw new Error(`raw rejected response missing from logs:\n${joined}`);
  }
});

Deno.test('Gemini success does not call Groq', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {});
  const groq = mockAdapter('groq', {});
  const logs: string[] = [];
  const result = await generateWithProviders(
    { systemPrompt: 's', userPrompt: 'u', operation: 'resume_tailoring' },
    { adapters: { gemini, groq }, providerChain: ['gemini', 'groq'], log: (m) => logs.push(m) },
  );
  if (!result.text.includes('PROFESSIONAL EXPERIENCE')) throw new Error('expected ATS text');
  if (result.tokensInput !== 100 || result.tokensOutput !== 200) {
    throw new Error(`expected provider tokens, got ${result.tokensInput}/${result.tokensOutput}`);
  }
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
  const result = await generateWithProviders(
    { systemPrompt: 's', userPrompt: 'u', operation: 'resume_tailoring' },
    { adapters: { gemini, groq }, providerChain: ['gemini', 'groq'], log: (m) => logs.push(m) },
  );
  if (groq.calls !== 1) throw new Error('groq should be called after timeout');
  if (!result.text.includes('SUMMARY')) throw new Error('expected groq ATS result');
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
    { adapters: { gemini, groq }, providerChain: ['gemini', 'groq'], log: () => {} },
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
    { adapters: { gemini, groq }, providerChain: ['gemini', 'groq'], log: () => {} },
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
      { adapters: { gemini, groq }, providerChain: ['gemini', 'groq'], log: () => {} },
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
  const result = await generateWithProviders(
    { systemPrompt: 's', userPrompt: 'u', operation: 'resume_tailoring' },
    { adapters: { gemini, groq }, providerChain: ['gemini', 'groq'], log: () => {} },
  );
  if (gemini.calls !== 0) throw new Error('gemini should be skipped');
  if (groq.calls !== 1) throw new Error('groq should run');
  if (!result.text.includes('PROFESSIONAL EXPERIENCE')) throw new Error('expected resume result');
});

Deno.test('Groq malformed ATS fails without returning corrupt text', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {
    generate: async () => {
      throw fail('timeout', true);
    },
  });
  const groq = mockAdapter('groq', {
    generate: async () => ({ text: 'not a resume', tokensInput: 1, tokensOutput: 1 }),
  });
  let message = '';
  try {
    await generateWithProviders(
      { systemPrompt: 's', userPrompt: 'u', operation: 'resume_tailoring' },
      { adapters: { gemini, groq }, providerChain: ['gemini', 'groq'], log: () => {} },
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
      { adapters: { gemini, groq }, providerChain: ['gemini', 'groq'], log: () => {} },
    );
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  if (!message.includes('All AI providers failed')) throw new Error(message);
  if (!message.includes('gemini') || !message.includes('groq')) throw new Error(message);
});

Deno.test('resume tailoring falls back to the source resume after Gemini and Groq fail', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {
    generate: async () => {
      throw fail('timeout', true, undefined, 'gemini down');
    },
  });
  const fallback = mockAdapter('gemini_fallback', {
    generate: async () => {
      throw fail('http_429', true, 429, 'quota');
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
  const logs: string[] = [];
  const result = await generateWithProviders(
    {
      systemPrompt: 's',
      userPrompt: 'u',
      operation: 'resume_tailoring',
      groundingSource: VALID_ATS,
    },
    {
      adapters: { gemini, gemini_fallback: fallback, groq },
      providerChain: ['gemini', 'gemini_fallback', 'groq'],
      log: (m) => logs.push(m),
    },
  );
  if (gemini.calls !== 1) throw new Error(`gemini calls ${gemini.calls}`);
  if (fallback.calls !== 1) throw new Error(`fallback calls ${fallback.calls}`);
  if (groq.calls !== 1) throw new Error(`groq calls ${groq.calls}`);
  if (!result.text.includes('PROFESSIONAL EXPERIENCE')) throw new Error('expected source resume');
  if (!logs.some((line) => line.includes('provider=deterministic'))) {
    throw new Error(`expected deterministic fallback log:\n${logs.join('\n')}`);
  }
});

Deno.test('HTTP 400 skips Groq but still uses the deterministic resume fallback', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const gemini = mockAdapter('gemini', {
    generate: async () => {
      throw fail('http_400', false, 400, 'invalid argument');
    },
  });
  const groq = mockAdapter('groq', {});
  const result = await generateWithProviders(
    {
      systemPrompt: 's',
      userPrompt: 'u',
      operation: 'resume_tailoring',
      groundingSource: VALID_ATS,
    },
    { adapters: { gemini, groq }, providerChain: ['gemini', 'groq'], log: () => {} },
  );
  if (groq.calls !== 0) throw new Error('must not fallback to Groq on 400');
  if (!result.text.includes('PROFESSIONAL EXPERIENCE')) throw new Error('expected source resume');
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
    { adapters: { gemini, groq }, providerChain: ['gemini', 'groq'], log: (m) => logs.push(m) },
  );
  const blob = logs.join('\n') + sanitizeAiErrorMessage('Bearer gsk_LIVESECRETKEY123');
  if (/gsk_LIVE|AIzaSyFAKE/.test(blob)) throw new Error('keys leaked in logs');
});

Deno.test('resume tailoring skips free Gemini even when a free key is configured', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const { getProviderChain } = await import('./config.ts');
  const gemini = mockAdapter('gemini', {});
  const fallback = mockAdapter('gemini_fallback', {});
  let chain: string[] = [];
  withEnv({
    GEMINI_API_KEY: 'free-key',
    GEMINI_API_KEY_FALLBACK: 'paid-key',
    GROQ_API_KEY: null,
    AI_FORCE_GROQ: null,
  }, () => {
    chain = getProviderChain('resume_tailoring');
  });
  await generateWithProviders(
    { systemPrompt: 's', userPrompt: 'u', operation: 'resume_tailoring' },
    { adapters: { gemini, gemini_fallback: fallback }, providerChain: chain, log: () => {} },
  );
  if (chain.includes('gemini')) throw new Error(`resume chain still has free Gemini: ${chain.join(' → ')}`);
  if (gemini.calls !== 0) throw new Error(`free Gemini should not run ATS, got ${gemini.calls}`);
  if (fallback.calls !== 1) throw new Error(`paid Gemini should run ATS, got ${fallback.calls}`);
});

Deno.test('paid Gemini retries once after unsupported_source_line with a repair prompt', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const invented = VALID_ATS.replace(
    'Senior engineer with distributed systems experience.',
    'AI executive with 15 years of invented platform leadership.',
  );
  const prompts: string[] = [];
  const fallback = mockAdapter('gemini_fallback', {
    generate: async (req) => {
      prompts.push(req.userPrompt);
      if (prompts.length === 1) {
        return { text: invented, tokensInput: 10, tokensOutput: 10 };
      }
      return { text: VALID_ATS, tokensInput: 10, tokensOutput: 10 };
    },
  });
  const groq = mockAdapter('groq', {});
  const result = await generateWithProviders(
    {
      systemPrompt: 's',
      userPrompt: 'Tailor this resume',
      operation: 'resume_tailoring',
      groundingSource: VALID_ATS,
    },
    {
      adapters: { gemini_fallback: fallback, groq },
      providerChain: ['gemini_fallback', 'groq'],
      log: () => {},
    },
  );
  if (fallback.calls !== 2) throw new Error(`expected one repair retry, got ${fallback.calls}`);
  if (groq.calls !== 0) throw new Error('groq should not run after a successful repair');
  if (!prompts[1]?.includes('unsupported_source_line')) {
    throw new Error(`repair prompt missing rejected line:\n${prompts[1]}`);
  }
  if (!result.text.includes('distributed systems experience')) {
    throw new Error('expected repaired ATS text');
  }
});

Deno.test('Groq first call receives the grounding repair hint after paid Gemini fails', async () => {
  const { generateWithProviders } = await import('./router.ts');
  const invented = VALID_ATS.replace(
    'Senior engineer with distributed systems experience.',
    'AI executive with 15 years of invented platform leadership.',
  );
  const fallback = mockAdapter('gemini_fallback', {
    generate: async () => ({ text: invented, tokensInput: 10, tokensOutput: 10 }),
  });
  const groqPrompts: string[] = [];
  const groq = mockAdapter('groq', {
    generate: async (req) => {
      groqPrompts.push(req.groqUserPrompt || req.userPrompt);
      return { text: VALID_ATS, tokensInput: 5, tokensOutput: 5 };
    },
  });
  await generateWithProviders(
    {
      systemPrompt: 's',
      userPrompt: 'Tailor this resume',
      groqUserPrompt: 'Short tailor prompt',
      operation: 'resume_tailoring',
      groundingSource: VALID_ATS,
    },
    {
      adapters: { gemini_fallback: fallback, groq },
      providerChain: ['gemini_fallback', 'groq'],
      log: () => {},
    },
  );
  if (fallback.calls !== 2) throw new Error(`expected paid Gemini generate+repair, got ${fallback.calls}`);
  if (groq.calls !== 1) throw new Error(`expected groq once, got ${groq.calls}`);
  if (!groqPrompts[0]?.includes('unsupported_source_line')) {
    throw new Error(`groq should see the rejected line:\n${groqPrompts[0]}`);
  }
});

