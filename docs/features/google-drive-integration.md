# Google Drive Integration

## Purpose

OAuth-based Google Drive/Docs integration for importing resumes from Google Docs, syncing generated PDFs to Drive, and managing the career corpus via linked documents.

## Entry Points

- `/integrations` route → `src/pages/IntegrationsPage.tsx`
- OAuth start → `supabase/functions/google-oauth-start/index.ts`
- OAuth callback → `supabase/functions/google-oauth-callback/index.ts`
- Token refresh → `supabase/functions/google-access-token/index.ts`

## Flow

### OAuth Connection
```
IntegrationsPage → "Connect Google Drive"
  → supabase.functions.invoke('google-oauth-start')
    → redirects to Google consent screen
      → Google callback → google-oauth-callback Edge Function
        → stores tokens in integrations table (credentials column)
          → redirects to /integrations?connected=google
```

### Google Doc Import
```
CorpusPage → import from Google Doc URL
  → services.resume.importGoogleDoc()
    → supabase.functions.invoke('resume-actions', { action: 'import_google_doc' })
      → google-doc-sync.ts → reads doc content via Drive API
        → stores as corpus resume
```

### PDF Sync to Drive
```
resume-actions { action: 'sync_drive' }
  → resume-pdf.ts (compile to PDF)
    → resume-drive.ts → resolveDriveFolderId() → uploadOrUpdateDrivePdf()
      → Google Drive API upload
```

## Important Files

- `src/pages/IntegrationsPage.tsx` — Integration management UI
- `supabase/functions/google-oauth-start/index.ts` — Initiates OAuth flow
- `supabase/functions/google-oauth-callback/index.ts` — Handles OAuth callback
- `supabase/functions/google-access-token/index.ts` — Token refresh endpoint
- `supabase/functions/_shared/google-drive.ts` — Drive API operations (upload, folder, file ID parsing)
- `supabase/functions/_shared/google-doc-sync.ts` — Google Docs content extraction
- `supabase/functions/_shared/credentials.ts` — OAuth token storage/retrieval, `GoogleAuthError`
- `supabase/functions/_shared/resume-drive.ts` — Resume-specific Drive operations
- `src/utils/google.ts` — Frontend Google Doc URL parsing
- `src/components/RequireGoogleDocGate.tsx` — UI gate for Google Doc connection

## Data Flow

- OAuth credentials stored in `integrations` table (encrypted `credentials` column).
- Access tokens refreshed via `google-access-token` Edge Function.
- Drive file IDs stored on resume records (`drive_file_id` column).
- `RequireGoogleDocGate` prompts user to connect Drive when needed.

## External Dependencies

- Google OAuth 2.0
- Google Drive API v3
- Google Docs API v1

## Common Failure Points

- Token expiration → `GoogleAuthError` → user must reconnect
- Drive folder creation race conditions
- File ID parsing from various Google Doc URL formats
- Integration credentials column is protected — frontend uses `get_integrations_safe()` RPC

## Important Rules

- Credentials are NEVER exposed to the frontend (security invoker RPC pattern)
- Token refresh is handled server-side only
- `RequireGoogleDocGate` checks integration status on app load
- The `connected` query param triggers `OAuthReturnRedirect` in `App.tsx`
