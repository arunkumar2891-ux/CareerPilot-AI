# Resume Management

## Purpose

Create, edit, version, score, and sync resumes. Supports master/corpus resumes and job-tailored resumes. Integrates with Google Drive for storage and ATS scoring via AI.

## Entry Points

- `/resumes` route → `src/pages/ResumesPage.tsx`
- `/corpus` route → `src/pages/CorpusPage.tsx`
- Resume actions backend → `supabase/functions/resume-actions/index.ts`

## Flow

### Resume Creation/Edit
```
ResumesPage / ResumeEditor
  → services.resume.create / update / save
    → supabase INSERT/UPDATE resumes table
```

### ATS Scoring
```
ResumeEditor → services.ats.score()
  → supabase.functions.invoke('ai-chat', { mode: 'ats_score' })
    → Gemini → returns JSON {score, feedback, suggestions}
```

### Google Drive Sync
```
services.resume.syncToDrive()
  → supabase.functions.invoke('resume-actions', { action: 'sync_drive' })
    → resume-pdf.ts → resume-drive.ts → Google Drive API
```

### Corpus Resume (Master/Role-specific)
```
CorpusPage → import from Google Doc / upload / paste
  → services.resume.importGoogleDoc / uploadCorpus
    → supabase.functions.invoke('resume-actions')
      → google-doc-sync.ts → resume-store.ts
```

## Important Files

- `src/pages/ResumesPage.tsx` — Resume list and management
- `src/pages/CorpusPage.tsx` — Career corpus management
- `src/components/resumes/ResumeEditor.tsx` — Rich resume editor
- `src/components/resumes/JdMatchPanel.tsx` — JD match scoring panel
- `src/services/index.ts` → `ResumeService`, `ATSService`
- `supabase/functions/resume-actions/index.ts` — Backend for all resume operations
- `supabase/functions/_shared/resume-store.ts` — DB persistence
- `supabase/functions/_shared/resume-parse.ts` — File parsing (PDF, DOCX extraction)
- `supabase/functions/_shared/resume-pdf.ts` — PDF compilation
- `supabase/functions/_shared/resume-drive.ts` — Google Drive upload/sync
- `supabase/functions/_shared/career-corpus/generate.ts` — AI resume generation
- `supabase/functions/_shared/career-corpus/prompt.ts` — `ATS_SYSTEM_PROMPT`, the output contract
- `supabase/functions/_shared/ai/validate-resume.ts` — Section order, caps, grounding, human voice
- `supabase/functions/_shared/resume-latex.ts` — ATS text → LaTeX for PDF rendering
- `src/utils/resume-classification.ts` — Corpus vs. job resume classification
- `src/utils/upload-sanitize.ts` — Upload validation and sanitization

## Tailored Resume Output Contract

AI-generated resumes must emit exactly these 8 sections, in order. `SELECTED PROJECTS` and
`CERTIFICATION` are optional and omitted when the source resume has none.

```text
NAME
CONTACT                     Email: / Phone: / Location: / LinkedIn: / GitHub:
SUMMARY                     2-3 sentences, first person
SKILLS                      "Category:" heading lines, each with "- " item lines
PROFESSIONAL EXPERIENCE     "COMPANY | Role", then "Dates | Location", then "- " bullets
SELECTED PROJECTS           plain title line, "- Type: Official|Personal",
                            "- Technologies: ...", then "- " bullets
CERTIFICATION               one "- " bullet per entry
EDUCATION                   one "- " bullet per entry
```

### Project type labels

Each project may carry a `- Type: Official` or `- Type: Personal` line directly under its title,
so a reader can tell employer/client work from self-directed work. The prompt derives the value
from the source resume only — the heading the project sits under, an employer named in the
project, or an explicit label — and omits the line when the source is unclear, which keeps the
"no invented facts" grounding rule intact.

`resume-latex.ts` treats `Type:` as project *meta* rather than an achievement bullet
(`PROJECT_META_RE`) and renders it above `Technologies:` (`sortProjectMeta`).

### Legacy section name

This section was called `PERSONAL PROJECTS` before v1.4.0. The old name is retained as an alias in
both `validate-resume.ts` (`HEADER_ALIASES`, plus markdown aliases and `PROJECT_SECTION_HEADERS`
in `resume-latex.ts`) because existing master resumes and cached tailored resumes still use it.
An unrecognized header is absorbed into the previous section rather than rejected, so dropping the
alias would silently delete the section from those resumes — see BUG-004.

Enforced by `prompt.ts` (generation) and `validate-resume.ts` (acceptance) — these two must be
changed together. Validation caps: 10,000 chars total, SUMMARY 1,400, SKILLS 2,500 chars / 24
lines, experience bullets `max(22, source count)`. Company, date, and project title lines are
headers and must **not** start with `- `.

See `AGENTS.md` → Resume Contract Guardrails before changing any of it.

## Data Flow

- Resumes stored in `resumes` table with content, ATS score, versions, and Drive metadata.
- Corpus resumes flagged via `is_corpus` / `corpus_type` columns.
- Resume versions tracked in `resume_versions` table.
- PDFs compiled server-side and uploaded to Google Drive or Supabase Storage.

## External Dependencies

- Google Drive API (PDF storage and sync)
- Google Docs API (import corpus from Google Docs)
- Gemini AI (ATS scoring, resume generation)

## Common Failure Points

- Google auth token expiration → `GoogleAuthError` with reconnect prompt
- PDF compilation failures on malformed content
- Large resume content can exceed AI token limits
- Drive sync state can become stale if sync fails mid-operation
- **Stale Edge Function deploy.** `resume-latex.ts` and `prompt.ts` are shared modules bundled
  into each importing function, so edits do nothing in production until that function is
  redeployed (`resume-actions` for PDFs, `workflow-run`/`workflow-step`/`ai-chat` for the
  contract). See `DEPLOY.md` → Which functions to redeploy.
- **PDF rendering is a separate layer from the contract.** `resume-latex.ts` re-parses the ATS
  text with its own parsers, and `moderncv` quirks matter (e.g. `{\bfseries ...\par}` inside a
  `\cvitem` minipage is discarded — use `\textbf{...}`). Valid contract output can still render
  wrong; verify the PDF itself.

## Important Rules

- `isCorpus` resumes are treated differently from job-tailored resumes
- Master resume is identified by name constant in `src/content/career-corpus/index.ts`
- Contact overlay is applied at generation time, not stored in corpus
- Upload files validated for size (`MAX_UPLOAD_BYTES`) and MIME type
