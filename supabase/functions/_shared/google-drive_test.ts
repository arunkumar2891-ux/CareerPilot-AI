import {
  driveFileTextStrategy,
  explainDriveExportError,
  parseGoogleDocFileId,
  parseGoogleDriveFolderId,
} from './google-drive.ts';

Deno.test('parseGoogleDocFileId extracts IDs and rejects junk', () => {
  const id = 'abcdefghijklmnopqrstuvwx';
  if (parseGoogleDocFileId(`https://docs.google.com/document/d/${id}/edit`) !== id) {
    throw new Error('doc url');
  }
  if (parseGoogleDocFileId(id) !== id) throw new Error('raw id');
  if (parseGoogleDocFileId('https://evil.example/document/d/notthis') !== '') {
    throw new Error('must reject short or invalid IDs');
  }
  if (parseGoogleDocFileId('../etc/passwd') !== '') throw new Error('path traversal');
  if (parseGoogleDocFileId('http://169.254.169.254/latest/meta-data') !== '') throw new Error('ssrf host');
});

Deno.test('parseGoogleDriveFolderId extracts IDs and rejects junk', () => {
  const id = 'abcdefghijklmnopqrstuvwx';
  if (parseGoogleDriveFolderId(`https://drive.google.com/drive/folders/${id}`) !== id) {
    throw new Error('folder url');
  }
  if (parseGoogleDriveFolderId(`https://drive.google.com/open?id=${id}`) !== id) throw new Error('open id');
  if (parseGoogleDriveFolderId('../../secret') !== '') throw new Error('traversal');
});

Deno.test('native Google Docs are exported as text', () => {
  const plan = driveFileTextStrategy({
    id: 'doc1',
    mimeType: 'application/vnd.google-apps.document',
  });
  if (plan.action !== 'export') throw new Error(JSON.stringify(plan));
});

Deno.test('Drive PDF and Word files are downloaded instead of exported', () => {
  const pdf = driveFileTextStrategy({ id: 'f1', mimeType: 'application/pdf' });
  if (pdf.action !== 'download' || pdf.mimeType !== 'application/pdf') {
    throw new Error(JSON.stringify(pdf));
  }
  const docx = driveFileTextStrategy({
    id: 'f2',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  if (docx.action !== 'download') throw new Error(JSON.stringify(docx));
});

Deno.test('Drive shortcuts follow the target file', () => {
  const plan = driveFileTextStrategy({
    id: 'shortcut',
    mimeType: 'application/vnd.google-apps.shortcut',
    shortcutDetails: { targetId: 'abcdefghijklmnopqrstuvwx' },
  });
  if (plan.action !== 'follow_shortcut' || plan.targetId !== 'abcdefghijklmnopqrstuvwx') {
    throw new Error(JSON.stringify(plan));
  }
});

Deno.test('Sheets and other Drive types are rejected with a Docs hint', () => {
  const plan = driveFileTextStrategy({
    id: 'sheet',
    mimeType: 'application/vnd.google-apps.spreadsheet',
  });
  if (plan.action !== 'reject') throw new Error(JSON.stringify(plan));
  if (!plan.reason.includes('Google Doc')) throw new Error(plan.reason);
});

Deno.test('Google export error is rewritten to a user-facing hint', () => {
  const message = explainDriveExportError('Export only supports Docs Editors files.');
  if (!message.includes('Corpus')) throw new Error(message);
  if (message.includes('{')) throw new Error(message);
});
