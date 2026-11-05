const BOUNDARY = 'careerpilot_boundary';

function encodeBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/** RFC 2047 encoded-word for non-ASCII header values (Subject, etc.). */
export function encodeMimeHeaderValue(value: string): string {
  if (!/[^\x00-\x7F]/.test(value)) return value;
  const b64 = encodeBase64(encodeUtf8(value)).replace(/=+$/, '');
  const prefix = '=?UTF-8?B?';
  const suffix = '?=';
  const maxChunk = 75 - prefix.length - suffix.length;
  const words: string[] = [];
  for (let i = 0; i < b64.length; i += maxChunk) {
    words.push(`${prefix}${b64.slice(i, i + maxChunk)}${suffix}`);
  }
  return words.join('\r\n ');
}

export function buildMimeMessage(opts: {
  to: string;
  subject: string;
  body: string;
  bodyContentType?: 'text/plain' | 'text/html';
  fromName?: string;
  attachment?: { fileName: string; contentType: string; data: Uint8Array };
}): string {
  const bodyContentType = opts.bodyContentType ?? 'text/plain';
  const lines: string[] = [];

  lines.push(`To: ${opts.to}`);
  lines.push(`Subject: ${encodeMimeHeaderValue(opts.subject)}`);
  lines.push('MIME-Version: 1.0');

  if (opts.attachment) {
    lines.push(`Content-Type: multipart/mixed; boundary="${BOUNDARY}"`);
    lines.push('');
    lines.push(`--${BOUNDARY}`);
    lines.push(`Content-Type: ${bodyContentType}; charset="UTF-8"`);
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(opts.body);
    lines.push('');
    lines.push(`--${BOUNDARY}`);
    lines.push(`Content-Type: ${opts.attachment.contentType}; name="${opts.attachment.fileName}"`);
    lines.push('Content-Disposition: attachment');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(encodeBase64(opts.attachment.data));
    lines.push('');
    lines.push(`--${BOUNDARY}--`);
  } else {
    lines.push(`Content-Type: ${bodyContentType}; charset="UTF-8"`);
    lines.push('');
    lines.push(opts.body);
  }

  return lines.join('\r\n');
}

export function encodeBase64Url(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}
