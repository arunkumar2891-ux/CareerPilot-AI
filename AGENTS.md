# AGENTS.md — AI Coding Agent Instructions

## Project

CareerPilot-AI: Autonomous AI job search platform. React SPA + Supabase Edge Functions backend. See `CONTEXT.md` for architecture. See `docs/FEATURE_MAP.md` for feature locations.

## Architecture

Read `CONTEXT.md` for stack, directory structure, and conventions.
Read `docs/FEATURE_MAP.md` to locate any feature's files.
Read `docs/features/<feature>.md` for deeper context on a specific feature.

## General Rules

- Prefer existing patterns and architecture. Study nearby code before writing new code.
- Reuse existing services, utilities, components, and types.
- Avoid unnecessary abstractions or indirection.
- Make minimal, scoped changes. Do not refactor unrelated code.
- Preserve existing API contracts unless explicitly asked to change them.
- Do not modify database schema unless explicitly required. Append new migrations only.
- Do not introduce new dependencies without justification.
- Do not manually edit `src/components/ui/` (shadcn/ui generated).
- Do not modify `supabase/migrations/` (append-only, already applied).
- Do not modify lockfiles, `dist/`, or `components.json`.
- Keep changes scoped to the requested task.

## Context & Search Rules

1. **Read `CONTEXT.md` first** when you need architectural context.
2. **Read `docs/FEATURE_MAP.md`** to locate which files belong to a feature.
3. **For bug fixes,** start with the files explicitly identified in the bug report.
4. **Do NOT search the entire repository** as a first step.
5. **Trace imports/calls/dependencies** from the relevant files to find related code.
6. **Only expand the search boundary** when inspected code proves another file is relevant.
7. **Prefer targeted searches** using feature name, function name, component name, route, error message, or symbol — not broad pattern sweeps.
8. **Avoid reading large unrelated files.** `src/services/index.ts` is ~2,400 lines — search within it by class/function name rather than reading the whole file.
9. **Do not modify files** merely because they are nearby or conceptually related.
10. **Keep the final change set minimal.**

## Key Files Quick Reference

| What | Where |
|------|-------|
| All frontend types | `src/types/index.ts` |
| All frontend services | `src/services/index.ts` |
| All Zustand stores | `src/store/index.ts` |
| Supabase client | `src/lib/supabase.ts` |
| App routes | `src/App.tsx` |
| App layout shell | `src/layouts/AppLayout.tsx` |
| Workflow engine | `supabase/functions/_shared/workflow/executor.ts` |
| AI provider routing | `supabase/functions/_shared/ai/router.ts` |
| Resume corpus logic | `supabase/functions/_shared/career-corpus/` |
| Google Drive integration | `supabase/functions/_shared/google-drive.ts` |
| DB migrations | `supabase/migrations/` |

## Bug-Fixing Workflow

**UNDERSTAND → IDENTIFY SCOPE → TRACE → DIAGNOSE → PLAN → MODIFY → VALIDATE**

### Before editing, confirm:

- Root cause identified with evidence
- List of files to modify and why each is relevant
- The fix is the smallest viable change

### After editing, report:

- Root cause
- Files changed and summary of changes
- Validation performed (`npm run typecheck`, `npm run lint`, manual testing)
- Any remaining risks

Use `BUGFIX.md` as the bug report template. Record resolved bugs in `BUG_LOG.md`.

## Validation Commands

```bash
npm run typecheck    # Type checking
npm run lint         # ESLint
npm run build        # Full build verification
```
