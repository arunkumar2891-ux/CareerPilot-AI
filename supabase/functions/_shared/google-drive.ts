const GOOGLE_FILE_ID_RE = /^[a-zA-Z0-9_-]{20,128}$/;

function asGoogleFileId(value: string | undefined): string {
  return value && GOOGLE_FILE_ID_RE.test(value) ? value : '';
}

/** Accept a Drive folder URL or raw ID from Settings. */
export function parseGoogleDriveFolderId(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return asGoogleFileId(folderMatch[1]);
  const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return asGoogleFileId(openMatch[1]);
  return asGoogleFileId(trimmed);
}

/** Accept a Docs URL or raw document ID from Settings. */
export function parseGoogleDocFileId(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const docMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return asGoogleFileId(docMatch[1]);
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return asGoogleFileId(fileMatch[1]);
  return asGoogleFileId(trimmed);
}

/** GlobalAxis, ArunkumarJS, ForwardDeploymentEngineer */
export function toDriveNameToken(value: string): string {
  const parts = String(value || '')
    .split(/[\s\-_/.,+()]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);
  const joined = parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return joined || 'Resume';
}

export function formatResumePdfDate(now = new Date()): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
  const [dd, mm, yyyy] = formatted.split('/');
  return `${dd}${mm}${yyyy}`;
}

/** Company_MyName_Role_ddmmyyyy.pdf */
export function buildResumePdfFileName(input: {
  company: string;
  personName: string;
  role: string;
  now?: Date;
}): string {
  const company = toDriveNameToken(input.company);
  const person = toDriveNameToken(input.personName);
  const role = toDriveNameToken(input.role);
  const date = formatResumePdfDate(input.now);
  return `${company}_${person}_${role}_${date}.pdf`;
}
