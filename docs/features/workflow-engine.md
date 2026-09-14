# Workflow Engine & Executions

## Purpose

The core automation engine. Executes directed-acyclic-graph (DAG) workflows that orchestrate job search, resume generation, scoring, and other pipeline steps. Supports scheduling, cancellation, retry, and observability.

## Entry Points

- `/executions` route → `src/pages/ExecutionsPage.tsx`
- `/executions/:runId` route → `src/pages/ExecutionDetailPage.tsx`
- Trigger API → `supabase/functions/workflow-run/index.ts`
- Step execution → `supabase/functions/workflow-step/index.ts`
- Scheduler → `supabase/functions/workflow-scheduler/index.ts`
- Cancel → `supabase/functions/workflow-cancel/index.ts`
- Retry → `supabase/functions/workflow-retry-failed/index.ts`

## Flow

### Workflow Execution
```
UI trigger or scheduler
  → workflow-run Edge Function
    → createRunBatch()            (one batch per job search)
      → advanceRunBatch()         (spawns ONE run per search target, linearly)
        → createRun() → executeWorkflow() (executor.ts)
          → graph.ts (entry nodes + edge traversal)
            → nodes.ts (per-node execution: HTTP, AI, Apify, etc.)
              → job-pipeline.ts (one Edge Function slice per job)
```

### The default job-search pipeline

```text
Shared prefix (once per run)
  Daily 7 AM → Sync Google Doc Resume → Build LinkedIn URL → Start Apify Scrape
    → Check Apify Status ⇄ Wait 10s → Fetch Results → Parse Jobs
    → Filter Duplicates → Limit Jobs

Per-job fan-out (one slice per job)
  Store Job → Match Score ⇥ (gate) → ATS Optimizer → Build LaTeX → Compile PDF → Upload to Storage

Fan-in (once per run)
  Email Summary → Send Email
```

`Match Score` runs **first inside the fan-out**, immediately after `Store Job`, and acts as a
**gate**. It scores the job against the **master resume** and writes `jobs.match_score` back
(`Store Job` already created the row). When the score is **not greater than**
`settings.jobSearch.minMatchScore` (default **80**), it returns a *skip output* and
`job-pipeline.ts` halts the rest of that job's chain — so no Gemini call, LaTeX build, PDF
compile or upload happens for a poor match.

Gated jobs are **not** discarded:

- they keep their real score in `jobs.match_score`;
- they stay in the **`discovered`** state (`Store Job` inserts as `discovered`; only a passing
  score promotes the row to `queued`), so they surface on the Discovered tab only;
- they are listed in the summary email under *"Below your N% match threshold"*;
- the user can run resume generation manually later, which advances them through
  `queued` → `resume_ready` as usual.

> **Why a code-level skip and not a `true`/`false` edge?** `executePerJobPipeline` walks the
> per-job chain **by array index** and ignores `result.route`; edge labels only steer the
> top-level executor (that is how the Apify poll loop forks). So the gate mirrors the existing
> duplicate skip (`isDuplicateSkipOutput`) instead. See `_shared/workflow/match-gate.ts`.

`Filter Duplicates` runs **before** `Limit Jobs` so the limit yields that many *new* jobs.

### Two levels of fan-out

These are independent and easy to confuse:

| Level | Unit | Module |
|-------|------|--------|
| **Run batch** | One `workflow_runs` row per search target, run strictly one at a time | `run-batch.ts` |
| **Per-job pipeline** | One Edge Function invocation per job within a run | `job-pipeline.ts` |

The in-run role loop (`startNextSearchRole`) was **removed**; `role-loop.ts` now only holds
read-only context accessors (`currentSearchRole`, `currentSearchLabel`, `nextJobIndexOffset`).

### Graph provisioning and repair

`ensureDefaultPipeline()` provisions the graph for new users and reconciles it for existing
ones via `repairDefaultPipelineGraph()`, which uses the pure planner in
`src/utils/pipeline-repair.ts`. The planner matches nodes by `type` + `action`/`builtin`
(never by name), restores missing nodes and edges, deletes retired steps, and realigns
positions — writing only a delta.

### Execution Observability
```
execution-persistence.ts → writes job_executions + node_executions
execution-status.ts → computes aggregate run status
ExecutionGraph.tsx → DAG visualization in UI
ExecutionRunLogs.tsx → log stream viewer
```

## Important Files

- `supabase/functions/_shared/workflow/executor.ts` — Main workflow executor
- `supabase/functions/_shared/workflow/graph.ts` — Entry-node detection and edge traversal
- `supabase/functions/_shared/workflow/nodes.ts` — Node type implementations
- `supabase/functions/_shared/workflow/run-batch.ts` — Run batches: one run per search target, linear
- `supabase/functions/_shared/workflow/run-lifecycle.ts` — Run state management
- `supabase/functions/_shared/workflow/job-pipeline.ts` — Per-job processing pipeline
- `supabase/functions/_shared/workflow/job-pipeline-slice.ts` — Pipeline slice execution
- `supabase/functions/_shared/workflow/role-loop.ts` — Read-only search-target context accessors
- `supabase/functions/_shared/job-search-roles.ts` — Target building, `MAX_SEARCH_ROLES = 5`
- `supabase/functions/_shared/workflow/execution-persistence.ts` — Observability persistence
- `supabase/functions/_shared/workflow/execution-status.ts` — Status computation
- `supabase/functions/_shared/workflow/types.ts` — Workflow type definitions
- `src/components/executions/ExecutionGraph.tsx` — DAG visualization component
- `src/components/executions/ExecutionRunLogs.tsx` — Log viewer
- `src/utils/execution-graph.ts` — Frontend graph layout computation
- `src/utils/execution.ts` — Execution display helpers
- `src/utils/pipeline-repair.ts` — Pure planner for reconciling the seeded graph
- `src/constants/workflow-seed.ts` — Default workflow templates (job search, resume tailor)
- `src/services/index.ts` → `WorkflowService`, `ExecutionService`, `AutomationService`

### Tests

| File | Covers |
|------|--------|
| `_shared/workflow/pipeline-repair_test.ts` | Graph reconciliation (18 tests) — legacy graphs, retired nodes, reachability, convergence, fan-out shape |
| `_shared/workflow/run-batch_test.ts` | Batch fan-out, linearity, double-spawn prevention (12 tests) |
| `_shared/workflow/seed-graph_test.ts` | Seed topology: single fork, single back-edge, `Match Score` placement |
| `_shared/workflow/apify-poll_test.ts` | Apify poll bounds (see BUG-002) |

Run them with:

```bash
deno test --allow-all --no-check supabase/functions/_shared/workflow/
```

## Data Flow

1. Workflow definition (nodes + edges) stored in `workflows` / `workflow_nodes` / `workflow_edges`
2. A job search creates a `workflow_run_batches` row, then one `workflow_runs` row per target
3. Run created in `workflow_runs` with status tracking (`batch_id`, `batch_index`, `search_label`)
4. Executor traverses graph, writing `node_executions` and `job_executions`
5. Logs written to `execution_logs` (via `get_run_logs` RPC)
6. Frontend polls run status and renders graph + logs
7. On finalization, `advanceRunBatch` spawns the next target — never in parallel

## External Dependencies

- Depends on node types: Apify, Gemini, Google Drive, HTTP, etc.
- Supabase cron for scheduled triggers

## Common Failure Points

- Long-running workflows can timeout (Edge Function wall-clock limit per invocation) — this
  is why work is sliced per job and checkpointed in `workflow_step_queue`
- Step queue polling failures for resumable workflows
- Partial failures when some jobs succeed and others fail in a batch
- **Duplicate `workflow_step_queue` rows** re-executing a node: the `waiting` branch must
  delete pending rows before inserting, and `processDueSteps` must claim atomically
- **Duplicate edges** between the same two nodes fork the run; migration `027` prevents this
- **Orphaned nodes** (no incoming edge) are treated as entry nodes by `getEntryNodes`, so a
  leftover node executes as a stray start node — retired steps must be deleted, not unlinked
- Graph cycles: only the intentional `Check Apify Status ⇄ Wait 10s` poll loop is allowed

## Important Rules

- The graph is a DAG apart from the single intentional Apify poll back-edge
- Node types defined in `WorkflowNodeType` union in `src/types/index.ts`
- Seed workflows (job search, resume tailor) are templates created during bootstrap, then
  reconciled on load by `repairDefaultPipelineGraph`
- **Never call `saveGraph` from a migration/repair path** — it deletes and re-inserts every
  node and edge (duplicate-key + statement-timeout risk). See `BUG_LOG.md` BUG-003.
- **Match nodes by `type` + `action`/`builtin`, not by name** — display names have drifted
  across seed versions (`Get Resume` → `Sync Google Doc Resume`)
- Node `positionX` is load-bearing: it drives the prefix / fan-out / fan-in split in
  `src/utils/execution-graph.ts`
- Cancellation is cooperative — nodes check run status between steps; cancelling a run in a
  batch cancels the whole batch
- Append-only for execution data: never delete/update historical runs
