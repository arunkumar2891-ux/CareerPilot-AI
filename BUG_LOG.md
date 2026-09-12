# Bug Log

Record resolved bugs here for future reference. Use the format below.

---

## Template

```
## BUG-XXX — [Short title]

**Status:** Fixed / Open / Investigating
**Feature:** [feature name]

**Symptom:** [what happened]
**Root Cause:** [why it happened]

**Files:**
- `path/to/file`

**Fix:** [short description]
**Validation:** [tests/manual validation performed]
```

---

## BUG-001 — Scheduled run fails with "Unexpected token '<', "<html> <h"... is not valid JSON"

**Status:** Fixed
**Feature:** Job search pipeline (Apify scraping)

**Symptom:** Scheduled daily run failed with `Unexpected token '<', "<html> <h"... is not valid JSON`. "Check Apify Status" appeared as the last successful node; no node-level error visible in UI or Supabase logs.

**Root Cause:** All three Apify API calls in the workflow `apify` node (`start_run`, `check_status`, `fetch_dataset`) called `res.json()` on the raw fetch response without checking `res.ok`. When Apify/Cloudflare returns an HTML error page (transient 502/503, rate limit, maintenance), `res.json()` throws the cryptic JSON parse error. The executor records it only as the run-level `error_message`, so the failing node (a later `check_status` poll iteration, or `fetch_dataset`) is not obvious in the graph.

**Files:**
- `supabase/functions/_shared/fetch-timeout.ts` (added `fetchJsonChecked`)
- `supabase/functions/_shared/workflow/nodes.ts` (apify node: all 3 actions)
- `supabase/functions/_shared/fetch-timeout_test.ts` (new regression tests)

**Fix:**
1. New `fetchJsonChecked()` helper reads the body as text, checks `res.ok` first, and throws descriptive errors including HTTP status — detecting HTML error pages explicitly instead of leaking the JSON parse error.
2. `check_status` now treats transient failures (5xx, HTML pages, network) as "keep polling" (returns `waiting`) with a consecutive-failure counter (`ctx.variables.apifyPollErrors`) that gives up after 5; 4xx still fails fast.
3. `fetch_dataset` retries once after 2s on transient errors; 4xx fails immediately with a descriptive message.

**Validation:** 4 new regression tests in `fetch-timeout_test.ts` (HTML 502, non-JSON 200, JSON error body, valid JSON) — all pass. Full existing Deno suite passes (99 core/workflow + 58 ai/career-corpus). Note: `resume-parse_test.ts` has a pre-existing broken import (`../resume-parse.ts` should be `./resume-parse.ts`) and was excluded.

---
