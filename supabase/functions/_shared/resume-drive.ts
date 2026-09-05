import { refreshGoogleToken, getUserSettings } from './credentials.ts';
import { createAdminClient } from './supabase-admin.ts';
import { fetchWithTimeout } from './fetch-timeout.ts';
import { buildResumePdfFileName, parseGoogleDriveFolderId } from './google-drive.ts';

export interface DriveSyncResult {
  fileId: string;
  pdfLink: string;
  fileName: string;
}

async function setAnyoneReader(accessToken: string, fileId: string): Promise<void> {
  try {
    await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      },
      10000,
      'Google Drive permissions',
    );
  } catch {
    // Link-sharing is optional.
  }
}

export async function uploadOrUpdateDrivePdf(
  userId: string,
  options: {
    pdfBytes: Uint8Array;
    fileName: string;
    folderId: string;
    existingFileId?: string | null;
  },
): Promise<DriveSyncResult> {
  const accessToken = await refreshGoogleToken(userId);
  const folderId = parseGoogleDriveFolderId(options.folderId);
  if (!folderId) {
    throw new Error('Google Drive folder is not set. Paste a folder link in Settings → Job Search, then retry.');
  }

  if (options.existingFileId) {
    const mediaRes = await fetchWithTimeout(
      `https://www.googleapis.com/upload/drive/v3/files/${options.existingFileId}?uploadType=media&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/pdf' },
        body: options.pdfBytes,
      },
      45000,
      'Google Drive update',
    );
    if (!mediaRes.ok) {
      const err = await mediaRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Google Drive update failed');
    }

    await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${options.existingFileId}?supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: options.fileName }),
      },
      15000,
      'Google Drive metadata update',
    );

    await setAnyoneReader(accessToken, options.existingFileId);
    return {
      fileId: options.existingFileId,
      pdfLink: `https://drive.google.com/file/d/${options.existingFileId}/view`,
      fileName: options.fileName,
    };
  }

  const metadata: Record<string, unknown> = {
    name: options.fileName,
    mimeType: 'application/pdf',
    parents: [folderId],
  };
  const boundary = 'careerpilot_boundary';
  const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
  const enc = new TextEncoder();
  const part1 = enc.encode(body);
  const part2 = enc.encode(`\r\n--${boundary}--`);
  const full = new Uint8Array(part1.length + options.pdfBytes.length + part2.length);
  full.set(part1);
  full.set(options.pdfBytes, part1.length);
  full.set(part2, part1.length + options.pdfBytes.length);

  const res = await fetchWithTimeout(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: full,
    },
    45000,
    'Google Drive upload',
  );
  const file = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `${file.error?.message || 'Drive upload failed'}. Reconnect Google in Integrations if this folder is not accessible.`,
    );
  }

  const fileId = String(file.id);
  await setAnyoneReader(accessToken, fileId);
  return {
    fileId,
    pdfLink: `https://drive.google.com/file/d/${fileId}/view`,
    fileName: options.fileName,
  };
}

export async function resolveDriveFolderId(userId: string): Promise<string> {
  const settings = await getUserSettings(userId);
  const jobSearch = (settings.jobSearch as Record<string, string> | undefined) || {};
  const folderId = parseGoogleDriveFolderId(String(jobSearch.driveFolderId || ''));
  if (!folderId) {
    throw new Error('Google Drive folder is not set. Paste a folder link in Settings → Job Search, then retry.');
  }
  return folderId;
}

export async function resolveResumePdfFileName(
  userId: string,
  input: { company?: string; role?: string; resumeName?: string },
): Promise<string> {
  const settings = await getUserSettings(userId);
  const contact = (settings.contact as Record<string, string> | undefined) || {};
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('user_id', userId)
    .maybeSingle();
  const personName = String(profile?.full_name || contact.fullName || '').trim() || 'Resume';
  const company = String(input.company || 'Company').trim();
  const role = String(input.role || input.resumeName || 'Role').trim();
  return buildResumePdfFileName({ company, personName, role });
}
