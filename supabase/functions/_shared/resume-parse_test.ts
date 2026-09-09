import {
  assertSafeUploadStoragePath,
  assertUploadMatchesKind,
  MAX_EXTRACTED_CHARS,
  MAX_UPLOAD_BYTES,
  resolveUploadMime,
  sanitizeExtractedResumeText,
  sniffUploadKind,
} from '../resume-parse.ts';

Deno.test('resolveUploadMime uses extension over claimed type', () => {
  if (resolveUploadMime('resume.PDF') !== 'application/pdf') throw new Error('pdf');
  if (resolveUploadMime('cv.docx') !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    throw new Error('docx');
  }
  if (resolveUploadMime('notes.md') !== 'text/markdown') throw new Error('md');
  if (resolveUploadMime('plain.txt') !== 'text/plain') throw new Error('txt');
  if (resolveUploadMime('photo.png', 'application/pdf') !== null) throw new Error('png must be rejected');
});

Deno.test('resolveUploadMime ignores claimed MIME when extension is executable', () => {
  if (resolveUploadMime('malware.exe', 'application/pdf') !== null) {
    throw new Error('claimed pdf must not override .exe');
  }
  if (resolveUploadMime('payload.html', 'text/plain') !== null) {
    throw new Error('html must not be accepted as text');
  }
});

Deno.test('sniffUploadKind detects PDF and ZIP magic bytes', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7\n%');
  if (sniffUploadKind(pdf) !== 'pdf') throw new Error('pdf magic');
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
  if (sniffUploadKind(zip) !== 'zip') throw new Error('zip magic');
  const text = new TextEncoder().encode('NAME\nJane Doe\n');
  if (sniffUploadKind(text) !== 'text') throw new Error('text');
  const html = new TextEncoder().encode('<html><script>alert(1)</script>');
  if (sniffUploadKind(html) !== 'html') throw new Error('html');
});

Deno.test('assertUploadMatchesKind rejects mismatched magic bytes', () => {
  const html = new TextEncoder().encode('<script>alert(1)</script>');
  try {
    assertUploadMatchesKind(html, 'application/pdf');
    throw new Error('html as pdf should throw');
  } catch (err) {
    if (!(err instanceof Error) || !/not a valid PDF/i.test(err.message)) throw err;
  }
  const pdf = new TextEncoder().encode('%PDF-1.4\n');
  assertUploadMatchesKind(pdf, 'application/pdf');
});

Deno.test('assertSafeUploadStoragePath rejects traversal and cross-user paths', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const file = '22222222-2222-4222-8222-222222222222-resume.pdf';
  assertSafeUploadStoragePath(userId, `${userId}/uploads/${file}`);
  const attacks = [
    `${userId}/uploads/../secrets.pdf`,
    `${userId}/uploads/${file}/../../other`,
    `other-user/uploads/${file}`,
    `${userId}/resumes/${file}`,
    `${userId}/uploads/not-a-uuid.pdf`,
    `${userId}\\uploads\\${file}`,
    `${userId}/uploads/${file}\0.pdf`,
  ];
  for (const path of attacks) {
    try {
      assertSafeUploadStoragePath(userId, path);
      throw new Error(`accepted unsafe path: ${path}`);
    } catch (err) {
      if (!(err instanceof Error) || !/Invalid upload path/i.test(err.message)) throw err;
    }
  }
});

Deno.test('sanitizeExtractedResumeText strips scripts, controls, and oversize payloads', () => {
  const dirty = 'Hello\u0000<script>alert(1)</script>\n[click](javascript:alert(1))\n<img src=x onerror=alert(1)>';
  const clean = sanitizeExtractedResumeText(dirty);
  if (clean.includes('<script') || clean.includes('javascript:') || clean.includes('\u0000')) {
    throw new Error(`unsafe residue: ${clean}`);
  }
  if (!clean.includes('Hello')) throw new Error('lost body text');
  const huge = 'A'.repeat(MAX_EXTRACTED_CHARS + 50);
  if (sanitizeExtractedResumeText(huge).length !== MAX_EXTRACTED_CHARS) {
    throw new Error('must cap extracted length');
  }
});

Deno.test('MAX_UPLOAD_BYTES is 10MB', () => {
  if (MAX_UPLOAD_BYTES !== 10 * 1024 * 1024) throw new Error('unexpected size cap');
});
