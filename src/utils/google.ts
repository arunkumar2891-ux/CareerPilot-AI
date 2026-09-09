const GOOGLE_FILE_ID_RE = /^[a-zA-Z0-9_-]{20,128}$/;

function asGoogleFileId(value: string | undefined): string {
  return value && GOOGLE_FILE_ID_RE.test(value) ? value : '';
}

export function parseGoogleDriveFolderId(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return asGoogleFileId(folderMatch[1]);
  const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return asGoogleFileId(openMatch[1]);
  return asGoogleFileId(trimmed);
}

export function parseGoogleDocFileId(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const docMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return asGoogleFileId(docMatch[1]);
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return asGoogleFileId(fileMatch[1]);
  return asGoogleFileId(trimmed);
}

export function googleDocResumeFileId(settings?: Record<string, unknown> | null): string {
  const jobSearch = settings?.jobSearch as Record<string, unknown> | undefined;
  return String(jobSearch?.resumeFileId ?? '').trim();
}

export function hasGoogleDocResumeId(settings?: Record<string, unknown> | null): boolean {
  return Boolean(googleDocResumeFileId(settings));
}
