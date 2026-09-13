-- 027_workflow_edges_unique.sql
--
-- Prevents duplicate edges between the same pair of nodes.
--
-- Two things made duplicates possible:
--   1. `repairDefaultPipelineGraph` used to rewrite the whole graph via
--      `saveGraph` (delete-all + insert-all). Overlapping callers (bootstrap and
--      JobsPage both call `ensureDefaultPipeline`) could interleave, and a delete
--      that hit the statement timeout (57014) left rows behind, so the following
--      insert failed with `workflow_nodes_pkey` (23505) — leaving the graph
--      half-written.
--   2. The repair now inserts only missing edges, but without a constraint two
--      concurrent repairs could each insert the same source→target pair (edge ids
--      are random UUIDs, so nothing collided).
--
-- A duplicate outgoing edge makes the executor fan out twice down the same
-- branch, which is what produced repeated node execution. Dedupe existing rows,
-- then enforce uniqueness so it cannot recur.

-- Keep the oldest row for each (workflow_id, source_id, target_id, label) group.
DELETE FROM workflow_edges e
USING workflow_edges keep
WHERE e.workflow_id = keep.workflow_id
  AND e.source_id = keep.source_id
  AND e.target_id = keep.target_id
  AND COALESCE(e.label, '') = COALESCE(keep.label, '')
  AND e.ctid > keep.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_edges_unique_link
  ON workflow_edges (workflow_id, source_id, target_id, COALESCE(label, ''));
