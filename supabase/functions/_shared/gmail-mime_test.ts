import { buildMimeMessage, encodeMimeHeaderValue } from './gmail-mime.ts';

Deno.test('buildMimeMessage defaults to plain text', () => {
  const mime = buildMimeMessage({ to: 'a@b.com', subject: 'Hi', body: 'Hello' });
  if (!mime.includes('Content-Type: text/plain; charset="UTF-8"')) {
    throw new Error('expected plain text content type');
  }
});

Deno.test('buildMimeMessage supports HTML bodies for summary email', () => {
  const mime = buildMimeMessage({
    to: 'recipient@example.com',
    subject: 'Summary',
    body: '<p>Jobs ready</p>',
    bodyContentType: 'text/html',
  });
  if (!mime.includes('Content-Type: text/html; charset="UTF-8"')) {
    throw new Error('expected html content type');
  }
  if (!mime.includes('<p>Jobs ready</p>')) throw new Error('html body missing');
});

Deno.test('encodeMimeHeaderValue RFC2047-encodes em dash subjects', () => {
  const subject = 'No New Jobs Found — Forward Deployed Engineer — 2026-11-04';
  const encoded = encodeMimeHeaderValue(subject);
  if (!encoded.startsWith('=?UTF-8?B?')) throw new Error('expected encoded-word subject');
  if (encoded.includes('—')) throw new Error('raw em dash must not appear in encoded header');
  const mime = buildMimeMessage({ to: 'a@b.com', subject, body: 'Hi' });
  const header = mime.split('\r\n').find((l) => l.startsWith('Subject:'));
  if (!header?.includes('=?UTF-8?B?')) throw new Error('Subject line must be RFC 2047 encoded');
});
