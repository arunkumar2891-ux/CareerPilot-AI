export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 120_000;

const ALLOWED_RESUME_EXT = /\.(pdf|docx|txt|md|markdown)$/i;

function stripUnsafeChars(value: string): string {
  return Array.from(value)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      if (code === 9 || code === 10 || code === 13) return true;
      return code >= 32 && code !== 127;
    })
    .join('');
}

export function isAllowedResumeFilename(name: string): boolean {
  const base = String(name || '').split(/[/\\]/).pop() || '';
  return ALLOWED_RESUME_EXT.test(base);
}

export function resolveUploadMime(fileName: string): string | null {
  const base = String(fileName || '').split(/[/\\]/).pop() || '';
  const lower = base.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return null;
}

export function sanitizeAttachmentLabel(name: string): string {
  return stripUnsafeChars(String(name || '').split(/[/\\]/).pop() || '')
    .replace(/[<>]/g, '')
    .slice(0, 120) || 'file';
}

export function sanitizeResumeName(name: string): string {
  return stripUnsafeChars(String(name || ''))
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function sanitizeExtractedResumeText(raw: string): string {
  let text = stripUnsafeChars(String(raw || ''));
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/\[([^\]]*)\]\(\s*(?:javascript|data|vbscript):[^)]+\)/gi, '$1');
  text = text.replace(/!\[[^\]]*]\(\s*(?:javascript|data|vbscript):[^)]+\)/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').replace(/[ \t]{2,}/g, ' ');
  text = text.trim();
  if (text.length > MAX_EXTRACTED_CHARS) text = text.slice(0, MAX_EXTRACTED_CHARS);
  return text;
}

export function assertResumeUploadFile(file: File): string {
  if (file.size <= 0) throw new Error('File is empty');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('File is too large (max 10 MB)');
  if (!isAllowedResumeFilename(file.name)) {
    throw new Error('Unsupported file type. Use PDF, DOCX, MD, or TXT.');
  }
  const mime = resolveUploadMime(file.name);
  if (!mime) throw new Error('Unsupported file type. Use PDF, DOCX, MD, or TXT.');
  return mime;
}
