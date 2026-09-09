# Resume Tailoring Simplification

Remove all hardcoded personal resume content from the repo, simplify the tailoring pipeline to "master resume + JD → Gemini → tailored output", add role-specific resume support with AI job matching, and enable file upload (PDF/DOCX/MD) alongside Google Doc sync. Workflows, LaTeX/PDF generation, ATS scoring, and all pages remain untouched.

## Work items

- Add `corpus_type` column to resumes table + update storage bucket MIME types
- Delete all hardcoded personal content files (`src/content/`, `src/resources/`, generated sections, scripts)
- Remove content seeding from BootstrapService; prompt user to sync/upload instead
- Rewrite `loadCareerCorpus`, prompt construction, and validation to simple resume+JD flow
- Remove role bank generation, bullet reranking, deterministic assembly, playbook system, and status banner
- Remove role bank status from settings/pages, clean up google-doc-sync triggers, update classification utils
- Add role-specific resume management to Corpus page (add/edit/delete with Google Doc, paste, or upload)
- Build file dropzone component, Edge Function parse mode (Gemini PDF/DOCX extraction), upload flow
- Add lightweight Gemini call at tailoring time to match job title to role-specific resume

## Current state (what changes)

The pipeline currently uses a complex retrieval system: 7 hardcoded role playbooks, bullet catalog with B001 IDs, evidence chunks, lexical matching, LLM reranking, role bank generation, and strict per-line grounding validation. All personal resume content is bundled in the repo under `src/content/career-corpus/` and `src/resources/`.

## Target state

- **No personal content in repo** — master resume comes entirely from Google Doc sync or direct upload
- **Simplified tailoring** — pass user's full resume + JD to Gemini with structural rules
- **Humanized output** — prompt engineering and post-generation checks ensure tailored resumes read like the candidate wrote them, not an AI
- **Role-specific resumes** — optional override, AI-matched to jobs by title
- **File upload** — PDF/DOCX/MD alongside existing Google Doc sync
- **Untouched** — workflows, LaTeX/PDF pipeline, ATS scoring, all page layouts

---

## Phase 1: Database schema

Add a migration to support corpus classification and role-specific resumes:

```sql
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS corpus_type TEXT;
-- values: 'master', 'role_specific', NULL (for job-tailored resumes)
-- role-specific resumes: name is the role label (e.g. "Forward Deployment Engineer")
```

The existing `is_corpus = true` flag stays. `corpus_type` distinguishes master vs role-specific.

---

## Phase 2: Delete hardcoded personal content

**Delete entirely:**

- `src/content/career-corpus/master-resume.md`
- `src/content/career-corpus/two-page-template.md`
- `src/content/career-corpus/experience-bullets.md`
- `src/content/career-corpus/ats-keywords.md`
- `src/content/career-corpus/role-playbooks.json`
- `src/content/career-corpus/evidence-chunks.json`
- `src/content/career-corpus/README.md`
- `src/resources/` (entire directory — 29 files, none imported by the app)
- `supabase/functions/_shared/career-corpus/careerpilot-section.generated.ts`
- `supabase/functions/_shared/careerpilot-project-section.ts`
- `scripts/sync-careerpilot-section.mjs`

**Gut and repurpose:**

- [src/content/career-corpus/index.ts](src/content/career-corpus/index.ts) — remove all `?raw` imports and `CAREER_CORPUS` export; keep only `MASTER_RESUME_NAME`, `TWO_PAGE_RESUME_NAME` (if still used as constants), `applyContactOverlay()`, and `DEFAULT_EDUCATION` placeholder
- [supabase/functions/_shared/career-corpus/data.ts](supabase/functions/_shared/career-corpus/data.ts) — remove inline `ROLE_PLAYBOOKS` and `EVIDENCE_CHUNKS` arrays entirely

---

## Phase 3: Simplify bootstrap

[src/services/index.ts](src/services/index.ts) `BootstrapService.seedCareerCorpus()`:

**Remove:**

- Seeding Master ATS and 2-page template from local markdown files
- Seeding `knowledge_chunks` from `evidence-chunks.json`
- `CORPUS_PLACEHOLDER` detection and re-seeding logic

**Keep:**

- `ensureDefaultPipeline()` and `ensureTailorPipeline()` (workflow creation)
- `repair_sync` call
- Default `jobSearch` settings
- Auto Google Doc sync if `resumeFileId` already set

**New behavior:** If no master resume exists in DB, the app prompts the user to either sync a Google Doc or upload a resume file — no content is seeded from the repo.

---

## Phase 4: Simplify the tailoring pipeline

This is the core change. The current flow through `loadCareerCorpus → prepareResumeGeneration → generateWithProviders → validateResumeOutput` is preserved but drastically simplified internally.

### 4a. Corpus loading — [load.ts](supabase/functions/_shared/career-corpus/load.ts)

**Current:** Loads master ATS, selects playbook, builds bullet catalog with B001 IDs, selects role bank or focused excerpt, retrieves evidence chunks, does lexical matching, scores candidates, optionally reranks with LLM, builds grounding source.

**New `loadCareerCorpus()`:**

1. Load all `is_corpus = true` resumes for the user
2. Find master resume (`corpus_type = 'master'`)
3. If role-specific resumes exist (`corpus_type = 'role_specific'`), call Gemini to pick the best match for this job title (short classification call, ~100 tokens)
4. If a role-specific resume matches, use it as the source; otherwise use master
5. Apply contact overlay from profile/settings
6. Return `{ sourceResume, contact, sourceName }` — no catalog, no evidence, no playbook

**AI role matching prompt** (new, lightweight):

```
Given these resume variants and a job title, return the name of
the best matching resume, or "master" if none fit.

Resumes: ["Forward Deployment Engineer", "Cloud Architect", ...]
Job title: "FDE - Forward Deployed Solutions"

Return only the name or "master".
```

### 4b. Prompt construction — [generate.ts](supabase/functions/_shared/career-corpus/generate.ts) and [prompt.ts](supabase/functions/_shared/career-corpus/prompt.ts)

**New `ATS_SYSTEM_PROMPT`** (simplified):

- You are a resume tailoring expert
- Output must follow this exact 7-section format: NAME, CONTACT, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, CERTIFICATION, EDUCATION
- Use `-` prefix for bullets
- Only use facts, metrics, and experience from the provided resume — never invent
- Target 2 pages; reorder and emphasize content relevant to the JD
- Plain text only, no markdown formatting

**Humanization rules** (baked into the system prompt to prevent AI-sounding output):

- Write in the candidate's original voice — preserve their phrasing, word choices, and tone from the source resume rather than rewriting into a generic template voice
- Never use LLM cliche words/phrases: "leveraged", "utilized", "spearheaded", "orchestrated", "synergized", "cutting-edge", "best-in-class", "innovative solutions", "cross-functional stakeholders", "drove impactful results"
- Prefer concrete action verbs the candidate already uses; only substitute when needed for JD keyword alignment
- Keep metrics and numbers exactly as they appear in the source — do not round, inflate, or embellish
- Summary section: write in first-person professional tone (not third-person bio style); 2-3 sentences max; no buzzword stacking
- Skills section: list actual technologies and tools from the source resume; do not pad with generic soft skills like "problem-solving" or "team player" unless they appear in the source
- Bullets should read like a human wrote them for a specific job, not like a template was filled in — vary sentence structure and length naturally
- Avoid starting every bullet with the same verb pattern; mix formats (achievement-first, context-first, metric-first)
- Do not add qualifiers like "successfully", "effectively", "proactively" unless they appear in the source
- The output should pass AI detection tools — if a recruiter reads it, it should feel like the candidate wrote it themselves with careful attention to the JD

**New `buildResumeUserPrompt()`** — three blocks:

1. `RESUME` — the user's full source resume text
2. `JOB DESCRIPTION` — the JD
3. `CONTACT` — name/email/phone/LinkedIn from settings (override)

Remove all: BULLET CATALOG, RERANKED SELECTION, RETRIEVED EVIDENCE, ROLE-FOCUSED SOURCE BANK, LEXICALLY MATCHED MASTER EXCERPTS, MATCHED PLAYBOOK, 2-PAGE TEMPLATE, TEMPLATE SKILLS/EDUCATION/CERTIFICATION blocks.

### 4c. Validation — [validate-resume.ts](supabase/functions/_shared/ai/validate-resume.ts)

**Keep:**

- 7-section header check (all present, correct order)
- Non-empty body check for required sections
- Two-page length check (<=10000 chars)
- Contact/identity overlay enforcement
- Duplicate line detection

**Remove:**

- Per-line grounding validation against bullet catalog
- `unsupported_source_line` rejection
- `buildCatalogGroundingSource()` and all catalog-based checks

**Simplify grounding** to: every PROFESSIONAL EXPERIENCE bullet should trace to a line in the source resume (fuzzy match with high threshold). This prevents Gemini from inventing experience but allows reasonable paraphrasing.

**Add humanization check:** Flag output that exhibits AI-generated patterns — repeated verb-initial structures, buzzword density above threshold, or uniform bullet length. If flagged, retry with an explicit "rewrite more naturally" follow-up prompt before accepting.

### 4d. Delete unused pipeline modules

- [supabase/functions/_shared/career-corpus/generate-role-banks.ts](supabase/functions/_shared/career-corpus/generate-role-banks.ts) — entire role bank generation system
- [supabase/functions/_shared/career-corpus/rerank-bullets.ts](supabase/functions/_shared/career-corpus/rerank-bullets.ts) — LLM bullet reranking
- [supabase/functions/_shared/career-corpus/assemble-source-locked-resume.ts](supabase/functions/_shared/career-corpus/assemble-source-locked-resume.ts) — deterministic fallback assembly
- [supabase/functions/_shared/career-corpus/resume-bullets.ts](supabase/functions/_shared/career-corpus/resume-bullets.ts) — bullet catalog, lexical matching, scoring (keep only basic utilities if needed by other modules)
- [src/content/career-corpus/resume-bank.ts](src/content/career-corpus/resume-bank.ts) — role bank utilities (`buildFocusedMasterResume`, `CROSS_SECTIONS_BY_PLAYBOOK`)
- [supabase/functions/_shared/career-corpus/resume-bank.ts](supabase/functions/_shared/career-corpus/resume-bank.ts) — Edge Function role bank copy

### 4e. Clean up references

- [supabase/functions/_shared/google-doc-sync.ts](supabase/functions/_shared/google-doc-sync.ts) — remove `generateRoleBanks` trigger, `scheduleRoleBankGeneration`, `setRoleBanksStatus`; keep the inbound sync flow (Doc → Master ATS content update + evidence chunk extraction)
- [supabase/functions/_shared/gemini.ts](supabase/functions/_shared/gemini.ts) — simplify `callGeminiAtsGenerateContent` to not require grounding source
- [supabase/functions/_shared/workflow/nodes.ts](supabase/functions/_shared/workflow/nodes.ts) — simplify `gemini` executor to use new simplified `prepareResumeGeneration`
- [supabase/functions/ai-chat/index.ts](supabase/functions/ai-chat/index.ts) — remove `sync_google_doc_chunks` role bank generation, remove `sync_careerpilot_project` mode
- [src/services/index.ts](src/services/index.ts) — remove `roleBanksStatus` tracking from settings, remove `RoleBanksStatusBanner` references
- [src/components/shared/RoleBanksStatusBanner.tsx](src/components/shared/RoleBanksStatusBanner.tsx) — delete this component

---

## Phase 5: Role-specific resume management (Corpus page)

[src/pages/CorpusPage.tsx](src/pages/CorpusPage.tsx):

**New layout:**

- **Master Resume** section — shows the synced master resume with status (synced/not synced), edit button, Google Doc sync button
- **Role-Specific Resumes** section — grid of role-specific resumes, each card showing role name, content preview, source (Google Doc / uploaded), edit/delete actions
- **Add Role Resume** dialog — name field (role label), then choose source:
  - Google Doc ID input + sync button
  - File upload (PDF/DOCX/MD) via dropzone
  - Paste content directly

Both master and role-specific resumes use `is_corpus: true` with `corpus_type` distinguishing them.

---

## Phase 6: File upload + document parsing

### 6a. Upload UI component

New `src/components/ui/file-dropzone.tsx` — reusable drag-and-drop + click-to-browse component. Accepts `.pdf`, `.docx`, `.md`, `.txt`. Shows progress, file name, error states.

### 6b. Storage bucket update

Migration to allow DOCX MIME type:

```sql
UPDATE storage.buckets SET allowed_mime_types = ARRAY[
  'application/pdf', 'text/plain', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] WHERE id = 'resumes';
```

### 6c. Edge Function: parse uploaded file

New mode in `resume-actions` (or `ai-chat`): `parse_uploaded_resume`

- Client uploads file to Supabase Storage (`resumes/{userId}/uploads/{filename}`)
- Calls Edge Function with storage path
- Edge Function downloads blob, determines type:
  - **MD/TXT**: use as-is
  - **PDF**: send to Gemini as inline document data for text extraction (Gemini natively handles PDF)
  - **DOCX**: send to Gemini as inline document data for text extraction
- Returns extracted plain text
- Client stores text in `resumes` table with appropriate `corpus_type`

This avoids needing binary parsing libraries in Deno — Gemini handles document understanding natively.

### 6d. Frontend upload flow

1. User clicks "Add Role Resume" or "Upload Master Resume" on Corpus page
2. Fills in role name (for role-specific) or confirms master
3. Drops/selects file OR pastes Google Doc ID OR pastes content
4. File → upload to Storage → call parse Edge Function → store extracted text
5. Google Doc → existing sync flow
6. Paste → store directly

---

## Phase 7: Clean up remaining references

- Remove `npm run sync:corpus` from `package.json` scripts
- Remove role bank status from [src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx) and [src/pages/KnowledgeBasePage.tsx](src/pages/KnowledgeBasePage.tsx)
- Update [src/utils/resume-classification.ts](src/utils/resume-classification.ts) to use `corpus_type` instead of name-prefix matching
- Clean up test files referencing removed modules

---

## What stays untouched

- Workflow system (workflow-run, workflow-step, workflow-scheduler, job-pipeline)
- LaTeX builder + PDF compiler
- ATS scoring (on-demand from Resume Editor)
- Google Drive PDF upload
- All page layouts and navigation
- Multi-job selection + parallel fan-out (just landed)
- Resume storage pattern (`upsertTailoredResume`)
- Job discovery pipeline
