import { nodeExecutors } from './nodes.ts';
import type { RunContext, WorkflowNodeRow } from './types.ts';

function makeCtx(variables: Record<string, unknown> = {}): RunContext {
  return {
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
    variables,
    nodeOutputs: {},
    settings: { jobSearch: { roles: ['Integration Architect'], location: 'Remote' } },
    items: [],
  } as unknown as RunContext;
}

function makeNode(action: string): WorkflowNodeRow {
  return {
    id: 'apify-status',
    name: 'Check Apify Status',
    type: 'apify',
    config: { action },
  } as unknown as WorkflowNodeRow;
}

function stubFetch(handler: () => Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(handler());
  return () => {
    globalThis.fetch = original;
  };
}

function stubEnv(): () => void {
  const original = Deno.env.get('APIFY_TOKEN');
  Deno.env.set('APIFY_TOKEN', 'test-token');
  return () => {
    if (original === undefined) Deno.env.delete('APIFY_TOKEN');
    else Deno.env.set('APIFY_TOKEN', original);
  };
}

function runningResponse(): Response {
  return new Response(JSON.stringify({ data: { status: 'RUNNING' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.test('check_status fails instead of polling forever once the attempt cap is exceeded', async () => {
  const restoreEnv = stubEnv();
  const restoreFetch = stubFetch(runningResponse);
  try {
    const ctx = makeCtx({
      apifyRunId: 'apify-run-1',
      apifyPollAttempts: 120,
      apifyPollStartedAt: Date.now() - 60_000,
    });
    let message = '';
    try {
      await nodeExecutors.apify.execute(ctx, makeNode('check_status'), {}, []);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    if (!message) throw new Error('expected the attempt cap to end the run');
    if (!message.includes('did not finish')) throw new Error(`unexpected message: ${message}`);
    if (!message.includes('RUNNING')) throw new Error(`message should report last status: ${message}`);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test('check_status fails once the wall-clock wait budget is exceeded', async () => {
  const restoreEnv = stubEnv();
  const restoreFetch = stubFetch(runningResponse);
  try {
    const ctx = makeCtx({
      apifyRunId: 'apify-run-1',
      apifyPollAttempts: 3,
      apifyPollStartedAt: Date.now() - 21 * 60 * 1000,
    });
    let message = '';
    try {
      await nodeExecutors.apify.execute(ctx, makeNode('check_status'), {}, []);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    if (!message.includes('did not finish')) throw new Error(`unexpected message: ${message}`);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test('check_status keeps waiting and increments attempts while under the cap', async () => {
  const restoreEnv = stubEnv();
  const restoreFetch = stubFetch(runningResponse);
  try {
    const ctx = makeCtx({ apifyRunId: 'apify-run-1' });
    const result = await nodeExecutors.apify.execute(ctx, makeNode('check_status'), {}, []);
    if (result.status !== 'waiting') throw new Error(`expected waiting, got ${result.status}`);
    if (!result.resumeAt) throw new Error('waiting must set resumeAt so the scheduler resumes it');
    if (ctx.variables.apifyPollAttempts !== 1) {
      throw new Error(`attempts should be tracked: ${ctx.variables.apifyPollAttempts}`);
    }
    if (!ctx.variables.apifyPollStartedAt) throw new Error('poll start time must be recorded');
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test('check_status treats TIMED-OUT as a terminal Apify failure', async () => {
  const restoreEnv = stubEnv();
  const restoreFetch = stubFetch(() =>
    new Response(JSON.stringify({ data: { status: 'TIMED-OUT' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  try {
    const ctx = makeCtx({ apifyRunId: 'apify-run-1' });
    let message = '';
    try {
      await nodeExecutors.apify.execute(ctx, makeNode('check_status'), {}, []);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    if (!message.includes('TIMED-OUT')) {
      throw new Error(`TIMED-OUT must fail fast, not poll forever: ${message || 'no error'}`);
    }
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test('check_status fails fast when the run id is missing from context', async () => {
  const restoreEnv = stubEnv();
  try {
    const ctx = makeCtx({});
    let message = '';
    try {
      await nodeExecutors.apify.execute(ctx, makeNode('check_status'), {}, []);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    if (!message.includes('no run id')) throw new Error(`unexpected message: ${message || 'no error'}`);
  } finally {
    restoreEnv();
  }
});

Deno.test('check_status succeeds and routes true on SUCCEEDED', async () => {
  const restoreEnv = stubEnv();
  const restoreFetch = stubFetch(() =>
    new Response(JSON.stringify({ data: { status: 'SUCCEEDED' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  try {
    const ctx = makeCtx({ apifyRunId: 'apify-run-1', apifyPollAttempts: 5 });
    const result = await nodeExecutors.apify.execute(ctx, makeNode('check_status'), {}, []);
    if (result.status !== 'success') throw new Error(`expected success, got ${result.status}`);
    if (result.route !== 'true') throw new Error(`expected route true, got ${result.route}`);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});
