import {
  advancePendingBatches,
  advanceRunBatch,
  buildTargetRunContext,
  cancelRunBatch,
  createRunBatch,
} from './run-batch.ts';
import type { SearchTarget } from '../job-search-roles.ts';

type Row = Record<string, unknown>;

interface Db {
  workflow_run_batches: Row[];
  workflow_runs: Row[];
  workflow_step_queue: Row[];
  workflows: Row[];
}

function makeDb(overrides: Partial<Db> = {}): Db {
  return {
    workflow_run_batches: [],
    workflow_runs: [],
    workflow_step_queue: [],
    workflows: [{
      id: 'wf-1',
      workflow_nodes: [
        { id: 'entry', type: 'schedule', name: 'Daily' },
        { id: 'url', type: 'transform', name: 'Build URL', config: { action: 'build_linkedin_url' } },
      ],
      workflow_edges: [{ source_id: 'entry', target_id: 'url' }],
    }],
    ...overrides,
  };
}

/**
 * Global so two `makeAdmin` instances over the same Db never mint the same id,
 * which would silently make two batches indistinguishable.
 */
let idSeq = 0;

/**
 * Minimal PostgREST-shaped fake. Deliberately enforces the partial unique index
 * on (batch_id, batch_index) — the guard the whole design rests on — so a
 * double-spawn shows up here rather than in production.
 */
function makeAdmin(db: Db, hooks: { beforeRunInsert?: () => void } = {}) {
  const nextId = (prefix: string) => `${prefix}-${++idSeq}`;

  const matches = (row: Row, filters: Array<[string, string, unknown]>): boolean =>
    filters.every(([op, col, val]) => {
      if (op === 'eq') return row[col] === val;
      if (op === 'in') return (val as unknown[]).includes(row[col]);
      if (op === 'lt') return Number(row[col] ?? 0) < Number(val);
      return true;
    });

  const table = (name: keyof Db) => {
    const rows = () => db[name];

    const builder = (filters: Array<[string, string, unknown]>, opts: {
      order?: { col: string; asc: boolean };
      limit?: number;
    } = {}) => {
      const resolve = () => {
        let out = rows().filter((r) => matches(r, filters));
        if (opts.order) {
          const { col, asc } = opts.order;
          out = [...out].sort((a, b) => {
            const av = Number(a[col] ?? 0);
            const bv = Number(b[col] ?? 0);
            return asc ? av - bv : bv - av;
          });
        }
        if (opts.limit !== undefined) out = out.slice(0, opts.limit);
        return out;
      };
      const api: Record<string, unknown> = {
        eq: (col: string, val: unknown) => builder([...filters, ['eq', col, val]], opts),
        in: (col: string, val: unknown) => builder([...filters, ['in', col, val]], opts),
        lt: (col: string, val: unknown) => builder([...filters, ['lt', col, val]], opts),
        order: (col: string, o?: { ascending?: boolean }) =>
          builder(filters, { ...opts, order: { col, asc: o?.ascending !== false } }),
        limit: (n: number) => builder(filters, { ...opts, limit: n }),
        select: () => builder(filters, opts),
        maybeSingle: () => Promise.resolve({ data: resolve()[0] ?? null, error: null }),
        single: () => {
          const found = resolve()[0];
          return Promise.resolve(
            found ? { data: found, error: null } : { data: null, error: { message: 'not found' } },
          );
        },
        then: (res: (v: { data: Row[]; error: null }) => unknown) =>
          Promise.resolve({ data: resolve(), error: null }).then(res),
      };
      return api;
    };

    return {
      select: () => builder([]),
      insert: (payload: Row) => {
        if (name === 'workflow_runs') {
          hooks.beforeRunInsert?.();
          if (payload.batch_id !== null && payload.batch_id !== undefined) {
            const clash = db.workflow_runs.some((r) =>
              r.batch_id === payload.batch_id && r.batch_index === payload.batch_index
            );
            if (clash) {
              const err = { code: '23505', message: 'duplicate key value violates unique constraint' };
              const rejected = {
                select: () => rejected,
                single: () => Promise.resolve({ data: null, error: err }),
                maybeSingle: () => Promise.resolve({ data: null, error: err }),
                then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: err }).then(res),
              };
              return rejected;
            }
          }
        }
        const row = { id: nextId(String(name)), ...payload };
        rows().push(row);
        const inserted = {
          select: () => inserted,
          single: () => Promise.resolve({ data: row, error: null }),
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
          then: (res: (v: unknown) => unknown) => Promise.resolve({ data: row, error: null }).then(res),
        };
        return inserted;
      },
      update: (patch: Row) => {
        const apply = (filters: Array<[string, string, unknown]>) => {
          const api: Record<string, unknown> = {
            eq: (col: string, val: unknown) => apply([...filters, ['eq', col, val]]),
            in: (col: string, val: unknown) => apply([...filters, ['in', col, val]]),
            lt: (col: string, val: unknown) => apply([...filters, ['lt', col, val]]),
            then: (res: (v: unknown) => unknown) => {
              for (const row of rows()) {
                if (matches(row, filters)) Object.assign(row, patch);
              }
              return Promise.resolve({ data: null, error: null }).then(res);
            },
          };
          return api;
        };
        return apply([]);
      },
      delete: () => {
        const apply = (filters: Array<[string, string, unknown]>) => ({
          eq: (col: string, val: unknown) => apply([...filters, ['eq', col, val]]),
          then: (res: (v: unknown) => unknown) => {
            db[name] = rows().filter((r) => !matches(r, filters)) as Row[];
            return Promise.resolve({ data: null, error: null }).then(res);
          },
        });
        return apply([]);
      },
    };
  };

  return { from: (name: string) => table(name as keyof Db) } as never;
}

function targets(n: number): SearchTarget[] {
  return Array.from({ length: n }, (_, i) => ({
    role: `Role ${i}`,
    location: i % 2 === 0 ? 'San Francisco, CA' : 'India',
    remoteOnly: i % 2 === 1,
    label: i % 2 === 1 ? `Role ${i} · India remote` : `Role ${i}`,
  }));
}

async function seedBatch(db: Db, count: number) {
  const admin = makeAdmin(db);
  const batch = await createRunBatch(admin, {
    userId: 'user-1',
    workflowId: 'wf-1',
    targets: targets(count),
    triggerType: 'schedule',
  });
  if (!batch) throw new Error('batch was not created');
  return { admin, batch };
}

Deno.test('run context nests the target under variables so it survives saveRunContext', () => {
  const ctx = buildTargetRunContext(targets(2)[1], 1);
  const vars = ctx.variables as Record<string, unknown>;
  if (!vars) throw new Error('a flat context would be discarded on the first context save');
  if (vars.currentRole !== 'Role 1') throw new Error(String(vars.currentRole));
  if (vars.currentLocation !== 'India' || vars.remoteOnly !== true) throw new Error('india remote target');
  if (vars.currentSearchLabel !== 'Role 1 · India remote') throw new Error(String(vars.currentSearchLabel));
  if (vars.batchIndex !== 1) throw new Error(String(vars.batchIndex));
  if (!('nodeOutputs' in ctx)) throw new Error('resume reader expects nodeOutputs');
});

Deno.test('createRunBatch returns null for an empty target list', async () => {
  const db = makeDb();
  const batch = await createRunBatch(makeAdmin(db), {
    userId: 'user-1',
    workflowId: 'wf-1',
    targets: [],
  });
  if (batch !== null) throw new Error('no targets means no batch');
  if (db.workflow_run_batches.length !== 0) throw new Error('must not persist an empty batch');
});

Deno.test('advanceRunBatch spawns the first target and queues its entry node', async () => {
  const db = makeDb();
  const { admin, batch } = await seedBatch(db, 3);

  const result = await advanceRunBatch(admin, batch.id);
  if (!result.spawned) throw new Error(`expected a spawn, got ${result.reason}`);
  if (db.workflow_runs.length !== 1) throw new Error(String(db.workflow_runs.length));

  const run = db.workflow_runs[0];
  if (run.batch_index !== 0) throw new Error(String(run.batch_index));
  if (run.batch_total !== 3) throw new Error('batch_total must be denormalized for the UI');
  if (run.search_label !== 'Role 0') throw new Error(String(run.search_label));
  if (run.trigger_type !== 'schedule') throw new Error('trigger type must carry over');
  if (db.workflow_step_queue.length !== 1) throw new Error('entry node must be queued');
  if (db.workflow_step_queue[0].node_id !== 'entry') throw new Error(String(db.workflow_step_queue[0].node_id));
});

Deno.test('advanceRunBatch refuses to spawn while a sibling run is active', async () => {
  for (const status of ['running', 'queued']) {
    const db = makeDb();
    const { admin, batch } = await seedBatch(db, 3);
    await advanceRunBatch(admin, batch.id);
    db.workflow_runs[0].status = status;

    const second = await advanceRunBatch(admin, batch.id);
    if (second.spawned) throw new Error(`linearity broken with a ${status} sibling`);
    if (second.reason !== 'active-run') throw new Error(String(second.reason));
    if (db.workflow_runs.length !== 1) throw new Error('Apify free tier cannot take concurrent runs');
  }
});

Deno.test('advanceRunBatch walks every target in order once each finishes', async () => {
  const db = makeDb();
  const { admin, batch } = await seedBatch(db, 4);

  for (let i = 0; i < 4; i++) {
    const result = await advanceRunBatch(admin, batch.id);
    if (!result.spawned) throw new Error(`target ${i} did not start: ${result.reason}`);
    if (result.batchIndex !== i) throw new Error(`out of order: ${result.batchIndex}`);
    db.workflow_runs[i].status = i === 2 ? 'failed' : 'success';
  }

  const labels = db.workflow_runs.map((r) => r.search_label);
  if (labels.length !== 4) throw new Error(String(labels.length));
  if (labels[1] !== 'Role 1 · India remote') throw new Error(String(labels[1]));

  const done = await advanceRunBatch(admin, batch.id);
  if (done.spawned) throw new Error('must not exceed the target list');
  if (done.reason !== 'batch-drained') throw new Error(String(done.reason));
  if (db.workflow_run_batches[0].status !== 'completed') throw new Error('batch must be marked completed');
  if (!db.workflow_run_batches[0].finished_at) throw new Error('finished_at must be stamped');
});

Deno.test('a failed target does not stall the batch (BUG-002 class)', async () => {
  const db = makeDb();
  const { admin, batch } = await seedBatch(db, 3);

  await advanceRunBatch(admin, batch.id);
  db.workflow_runs[0].status = 'failed';

  const next = await advanceRunBatch(admin, batch.id);
  if (!next.spawned) throw new Error('a dead target must not block later targets');
  if (next.batchIndex !== 1) throw new Error(String(next.batchIndex));
});

Deno.test('a duplicate (batch_id, batch_index) insert cannot double-spawn', async () => {
  const db = makeDb();
  const { admin, batch } = await seedBatch(db, 3);
  await advanceRunBatch(admin, batch.id);
  db.workflow_runs[0].status = 'success';

  // Model the real race: the scheduler and run finalization both decide index 1
  // is next. The competitor's row lands after our index check but before our
  // insert, so only the unique index can stop the double-spawn.
  let raced = false;
  const racing = makeAdmin(db, {
    beforeRunInsert: () => {
      if (raced) return;
      raced = true;
      db.workflow_runs.push({
        id: 'competitor',
        batch_id: batch.id,
        batch_index: 1,
        status: 'success',
        search_label: 'Role 1 · India remote',
      });
    },
  });

  const result = await advanceRunBatch(racing, batch.id);
  if (result.spawned) throw new Error('the unique index must reject the duplicate index');
  if (result.reason !== 'index-taken') throw new Error(String(result.reason));

  const atIndexOne = db.workflow_runs.filter((r) => r.batch_id === batch.id && r.batch_index === 1);
  if (atIndexOne.length !== 1) throw new Error(`index 1 spawned ${atIndexOne.length} times`);
  if (Number(db.workflow_run_batches[0].cursor) !== 2) {
    throw new Error('cursor must move past a taken index so the batch cannot spin');
  }

  // The batch is not stuck: the following target still starts.
  const next = await advanceRunBatch(admin, batch.id);
  if (!next.spawned || next.batchIndex !== 2) throw new Error('batch must continue after a lost race');
});

Deno.test('deleting a run does not replay an already-completed target', async () => {
  const db = makeDb();
  const { admin, batch } = await seedBatch(db, 4);

  for (let i = 0; i < 2; i++) {
    await advanceRunBatch(admin, batch.id);
    db.workflow_runs[i].status = 'success';
  }
  // Users can delete individual run rows. The cursor must still hold the place,
  // otherwise index 1 would be scraped and emailed a second time.
  db.workflow_runs = db.workflow_runs.filter((r) => r.batch_index !== 1);

  const next = await advanceRunBatch(admin, batch.id);
  if (!next.spawned) throw new Error(`expected target 2, got ${next.reason}`);
  if (next.batchIndex !== 2) throw new Error(`replayed a finished target: ${next.batchIndex}`);
});

Deno.test('cancelRunBatch halts all further targets', async () => {
  const db = makeDb();
  const { admin, batch } = await seedBatch(db, 5);

  await advanceRunBatch(admin, batch.id);
  db.workflow_runs[0].status = 'cancelled';
  await cancelRunBatch(admin, batch.id);

  const after = await advanceRunBatch(admin, batch.id);
  if (after.spawned) throw new Error('Stop must stop the whole batch, not just one target');
  if (after.reason !== 'batch-inactive') throw new Error(String(after.reason));
  if (db.workflow_runs.length !== 1) throw new Error(String(db.workflow_runs.length));
  if (db.workflow_run_batches[0].status !== 'cancelled') throw new Error('batch must read cancelled');
});

Deno.test('advanceRunBatch is a no-op for a missing batch', async () => {
  const db = makeDb();
  const result = await advanceRunBatch(makeAdmin(db), 'does-not-exist');
  if (result.spawned) throw new Error('must not spawn for an unknown batch');
  if (result.reason !== 'batch-missing') throw new Error(String(result.reason));
});

Deno.test('advancePendingBatches drives only running batches', async () => {
  const db = makeDb();
  const active = await seedBatch(db, 2);
  const stopped = await seedBatch(db, 2);
  if (active.batch.id === stopped.batch.id) throw new Error('fixture must create two distinct batches');
  await cancelRunBatch(stopped.admin, stopped.batch.id);

  const spawned = await advancePendingBatches(active.admin);
  if (spawned !== 1) throw new Error(`only the running batch should advance, got ${spawned}`);
  if (db.workflow_runs.length !== 1) throw new Error(String(db.workflow_runs.length));
  if (db.workflow_runs[0].batch_id !== active.batch.id) throw new Error('wrong batch advanced');
});

Deno.test('advancePendingBatches survives a batch whose workflow has no entry node', async () => {
  const db = makeDb({ workflows: [{ id: 'wf-1', workflow_nodes: [], workflow_edges: [] }] });
  const { admin, batch } = await seedBatch(db, 2);

  const spawned = await advancePendingBatches(admin);
  if (spawned !== 0) throw new Error('nothing to start without an entry node');
  const stored = db.workflow_run_batches.find((b) => b.id === batch.id);
  if (stored?.status !== 'completed') throw new Error('an unstartable batch must not linger forever');
});
