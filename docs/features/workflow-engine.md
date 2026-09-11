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
    → loadWorkflow() → createRun()
      → executeWorkflow() (executor.ts)
        → graph.ts (topological traversal)
          → nodes.ts (per-node execution: HTTP, AI, Apify, etc.)
            → job-pipeline.ts (per-job processing within a batch)
              → role-loop.ts (multi-role iteration)
```

### Execution Observability
```
execution-persistence.ts → writes job_executions + node_executions
execution-status.ts → computes aggregate run status
ExecutionGraph.tsx → DAG visualization in UI
ExecutionRunLogs.tsx → log stream viewer
```

## Important Files

- `supabase/functions/_shared/workflow/executor.ts` — Main workflow executor
- `supabase/functions/_shared/workflow/graph.ts` — DAG traversal and topological sort
- `supabase/functions/_shared/workflow/nodes.ts` — Node type implementations
- `supabase/functions/_shared/workflow/run-lifecycle.ts` — Run state management
- `supabase/functions/_shared/workflow/job-pipeline.ts` — Per-job processing pipeline
- `supabase/functions/_shared/workflow/job-pipeline-slice.ts` — Pipeline slice execution
- `supabase/functions/_shared/workflow/role-loop.ts` — Multi-role search iteration
- `supabase/functions/_shared/workflow/execution-persistence.ts` — Observability persistence
- `supabase/functions/_shared/workflow/execution-status.ts` — Status computation
- `supabase/functions/_shared/workflow/types.ts` — Workflow type definitions
- `src/components/executions/ExecutionGraph.tsx` — DAG visualization component
- `src/components/executions/ExecutionRunLogs.tsx` — Log viewer
- `src/utils/execution-graph.ts` — Frontend graph layout computation
- `src/utils/execution.ts` — Execution display helpers
- `src/constants/workflow-seed.ts` — Default workflow templates (job search, resume tailor)
- `src/services/index.ts` → `WorkflowService`, `ExecutionService`, `AutomationService`

## Data Flow

1. Workflow definition (nodes + edges) stored in `workflows` table
2. Run created in `workflow_runs` with status tracking
3. Executor traverses graph, writing `node_executions` and `job_executions`
4. Logs written to `execution_logs` (via `get_run_logs` RPC)
5. Frontend polls run status and renders graph + logs

## External Dependencies

- Depends on node types: Apify, Gemini, Google Drive, HTTP, etc.
- Supabase cron for scheduled triggers

## Common Failure Points

- Long-running workflows can timeout (Edge Function 150s limit per invocation)
- Step queue polling failures for resumable workflows
- Partial failures when some jobs succeed and others fail in a batch
- Graph cycles would cause infinite loops (must be DAG)

## Important Rules

- Workflows are DAGs — no cycles allowed
- Node types defined in `WorkflowNodeType` union in `src/types/index.ts`
- Seed workflows (job search, resume tailor) are templates created during bootstrap
- Cancellation is cooperative — nodes check run status between steps
- Append-only for execution data: never delete/update historical runs
