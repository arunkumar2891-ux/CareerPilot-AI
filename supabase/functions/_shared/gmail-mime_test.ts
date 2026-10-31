import { buildMimeMessage } from './gmail-mime.ts';

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
