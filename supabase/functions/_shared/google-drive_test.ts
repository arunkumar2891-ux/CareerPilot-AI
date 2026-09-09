import { parseGoogleDocFileId, parseGoogleDriveFolderId } from './google-drive.ts';

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
