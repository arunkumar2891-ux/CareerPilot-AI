import { refreshGoogleToken } from './credentials.ts';
import { fetchWithTimeout } from './fetch-timeout.ts';

const BOUNDARY = 'careerpilot_boundary';

function encodeBase64Url(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function buildMimeMessage(opts: {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  attachment?: { fileName: string; contentType: string; data: Uint8Array };
}): string {
  const lines: string[] = [];

  lines.push(`To: ${opts.to}`);
  lines.push(`Subject: ${opts.subject}`);
  lines.push('MIME-Version: 1.0');

  if (opts.attachment) {
    lines.push(`Content-Type: multipart/mixed; boundary="${BOUNDARY}"`);
    lines.push('');
    lines.push(`--${BOUNDARY}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
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
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('');
    lines.push(opts.body);
  }

  return lines.join('\r\n');
}

export type GmailSendResult = {
  messageId: string;
  threadId: string;
};

export async function sendGmailMessage(
  userId: string,
  opts: {
    to: string;
    subject: string;
    body: string;
    attachment?: { fileName: string; contentType: string; data: Uint8Array };
  },
): Promise<GmailSendResult> {
  const accessToken = await refreshGoogleToken(userId);

  const mime = buildMimeMessage(opts);
  const raw = encodeBase64Url(encodeUtf8(mime));

  const res = await fetchWithTimeout(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    },
    30000,
    'Gmail send',
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = String(err?.error?.message || err?.error || `Gmail send failed (${res.status})`);
    if (res.status === 403 && /insufficient/i.test(msg)) {
      throw new Error(
        'Gmail send permission not granted. Please reconnect Google in Integrations to enable email sending.',
      );
    }
    throw new Error(msg);
  }

  const data = await res.json();
  return {
    messageId: String(data.id || ''),
    threadId: String(data.threadId || ''),
  };
}
