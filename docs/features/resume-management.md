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
- `src/utils/resume-classification.ts` — Corpus vs. job resume classification
- `src/utils/upload-sanitize.ts` — Upload validation and sanitization

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

## Important Rules

- `isCorpus` resumes are treated differently from job-tailored resumes
- Master resume is identified by name constant in `src/content/career-corpus/index.ts`
- Contact overlay is applied at generation time, not stored in corpus
- Upload files validated for size (`MAX_UPLOAD_BYTES`) and MIME type
