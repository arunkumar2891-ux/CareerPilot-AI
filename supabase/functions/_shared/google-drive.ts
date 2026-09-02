/** Accept a Drive folder URL or raw ID from Settings. */
export function parseGoogleDriveFolderId(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return trimmed;
}

/** Accept a Docs URL or raw document ID from Settings. */
export function parseGoogleDocFileId(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const docMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return docMatch[1];
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return trimmed;
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
