import { refreshGoogleToken } from './credentials.ts';
import { fetchWithTimeout } from './fetch-timeout.ts';
import { buildMimeMessage, encodeBase64Url, encodeUtf8 } from './gmail-mime.ts';

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
    bodyContentType?: 'text/plain' | 'text/html';
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
