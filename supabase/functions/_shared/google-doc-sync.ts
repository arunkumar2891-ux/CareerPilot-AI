import { extractResumeTextFromBytes, MAX_UPLOAD_BYTES, sanitizeExtractedResumeText } from './resume-parse.ts';
import { createAdminClient } from './supabase-admin.ts';
import { refreshGoogleToken } from './credentials.ts';
import { fetchWithTimeout } from './fetch-timeout.ts';
import {
  driveFileTextStrategy,
  explainDriveExportError,
  type DriveFileMeta,
} from './google-drive.ts';

const MASTER_RESUME_NAME = 'Master ATS (bullet bank)';

const TAG_KEYWORDS: Record<string, string[]> = {
  fw_flex: ['fw_flex', 'fw_register', 'firewall flex', 'worker pipeline'],
  snaplogic: ['snaplogic', 'snap reduction', 'snaps', 'pipeline', 'iPaaS'],
  bigquery: ['bigquery', 'bq', 'merge statement'],
  gcp: ['gcp', 'google cloud', 'vertex ai', 'gke', 'pub/sub'],
  performance: ['latency', 'performance', 'faster', 'improvement'],
  cost: ['cost reduction', 'cost', 'savings'],
  portal: ['portal', 'automations portal'],
  kubernetes: ['kubernetes', 'k8s', 'gke', 'helm', 'hpa'],
  security: ['security', 'vulnerability', 'compliance', 'vault'],
  leadership: ['mentor', 'workshop', 'training', 'documentation', 'team'],
  incident: ['incident', 'p1', 'root cause', 'rca'],
  integration: ['integration', 'standardiz', 'consolidat', 'framework'],
  fullstack: ['react', 'typescript', 'frontend', 'backend', 'express'],
  gemini: ['gemini', 'vertex ai', 'llm', 'ai agent', 'rag'],
  productivity: ['hours saved', 'roi', 'annual value'],
  refactor: ['refactor', 'monolith', 'reduction', 'consolidated'],
  reliability: ['uptime', '99.9', 'zero rollback', 'zero data loss'],
  observability: ['datadog', 'chronosphere', 'monitoring', 'logging'],
  devops: ['ci/cd', 'harness', 'docker', 'deployment'],
  documentation: ['specification', 'documentation', 'lines of'],
  adoption: ['users', 'concurrent', 'adoption'],
};

function inferTags(bullet: string): string[] {
  const lower = bullet.toLowerCase();
  const tags: string[] = [];
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) tags.push(tag);
  }
  return tags.length ? tags : ['general'];
}

function hasMetric(line: string): boolean {
  const metricPattern = /\d+[%x×]|\d+-\d+x|\d+\.\d+[x%]|\b\d{2,}\b/;
  const verbs = /\b(achieved|delivered|reduced|improved|saved|built|implemented|designed|architected|deployed|migrated|resolved|eliminated|consolidated|created|integrated|established)\b/i;
  return metricPattern.test(line) && verbs.test(line);
}

export function parseGoogleDocResume(docContent: string): string {
  const endIdx = docContent.indexOf('END OF MASTER RESUME');
  let resumeContent = docContent;
  if (endIdx !== -1) resumeContent = docContent.slice(0, endIdx).trim();
  const tailoringIdx = resumeContent.indexOf('TAILORING INSTRUCTIONS');
  if (tailoringIdx !== -1) {
    resumeContent = resumeContent.slice(0, resumeContent.lastIndexOf('=', tailoringIdx)).trim();
  }
  return resumeContent.trim();
}

export function extractChunksFromDoc(docContent: string): { id: string; tags: string[]; text: string }[] {
  const lines = docContent.split('\n');
  const chunks: { id: string; tags: string[]; text: string }[] = [];
  const seenTexts = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('- ') && !line.startsWith('• ')) continue;
    const bullet = line.replace(/^[-•]\s*/, '').trim();
    if (bullet.length < 50) continue;
    if (!hasMetric(bullet)) continue;
    const norm = bullet.toLowerCase().replace(/\s+/g, ' ');
    if (seenTexts.has(norm)) continue;
    seenTexts.add(norm);
    const tags = inferTags(bullet);
    const id = bullet.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3).slice(0, 4).join('-').slice(0, 40) || `chunk-${chunks.length}`;
    chunks.push({ id, tags, text: bullet });
  }
  return chunks;
}

async function googleJsonError(res: Response): Promise<string> {
  const raw = await res.text();
  try {
    const err = JSON.parse(raw) as { error?: { message?: string } | string };
    const nested = err.error;
    const message = typeof nested === 'string'
      ? nested
      : nested?.message || res.statusText || 'Failed to fetch Google Doc';
    return explainDriveExportError(message);
  } catch {
    return explainDriveExportError(raw || res.statusText || 'Failed to fetch Google Doc');
  }
}

async function fetchDriveFileMeta(accessToken: string, fileId: string): Promise<DriveFileMeta> {
  const res = await fetchWithTimeout(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,shortcutDetails&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    15000,
    'Google Drive metadata',
  );
  if (!res.ok) throw new Error(await googleJsonError(res));
  return await res.json() as DriveFileMeta;
}

async function fetchDriveFileBytes(accessToken: string, fileId: string): Promise<Uint8Array> {
  const res = await fetchWithTimeout(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    30000,
    'Google Drive download',
  );
  if (!res.ok) throw new Error(await googleJsonError(res));
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('File is too large (max 10 MB)');
  return bytes;
}

export async function fetchGoogleDocText(userId: string, fileId: string, hop = 0): Promise<string> {
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(fileId)) {
    throw new Error('Invalid Google Doc ID');
  }
  if (hop > 2) throw new Error(explainDriveExportError('Export only supports Docs Editors files.'));
  const accessToken = await refreshGoogleToken(userId);
  const meta = await fetchDriveFileMeta(accessToken, fileId);
  const plan = driveFileTextStrategy(meta);

  if (plan.action === 'follow_shortcut') {
    return fetchGoogleDocText(userId, plan.targetId, hop + 1);
  }
  if (plan.action === 'reject') throw new Error(plan.reason);
  if (plan.action === 'download') {
    const bytes = await fetchDriveFileBytes(accessToken, fileId);
    return sanitizeExtractedResumeText(await extractResumeTextFromBytes(bytes, plan.mimeType));
  }

  const res = await fetchWithTimeout(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    30000,
    'Google Doc export',
  );
  if (!res.ok) throw new Error(await googleJsonError(res));
  return await res.text();
}

export async function syncGoogleDocToCorpus(userId: string, fileId: string, options?: {
  corpusType?: 'master' | 'role_specific';
  name?: string;
}): Promise<{
  docContent: string;
  resumeContent: string;
  chunksExtracted: number;
  newChunksAdded: number;
  totalExisting: number;
  resumeUpdated: boolean;
}> {
  const docContent = sanitizeExtractedResumeText(await fetchGoogleDocText(userId, fileId));
  const resumeContent = sanitizeExtractedResumeText(parseGoogleDocResume(docContent));
  const corpusType = options?.corpusType || 'master';
  const resumeName = options?.name?.trim() || (corpusType === 'master' ? MASTER_RESUME_NAME : '');
  if (!resumeName) throw new Error('Role resume name is required');

  const admin = createAdminClient();
  let chunksExtracted = 0;
  let newChunksAdded = 0;
  let totalExisting = 0;

  if (corpusType === 'master') {
    const chunks = extractChunksFromDoc(docContent);
    chunksExtracted = chunks.length;
    const { error: deleteError } = await admin
      .from('knowledge_chunks')
      .delete()
      .eq('user_id', userId)
      .eq('collection', 'career');
    if (deleteError) throw deleteError;

    const toInsert = chunks.map((c) => ({
      user_id: userId,
      collection: 'career',
      source_id: c.id,
      tags: c.tags,
      content: c.text,
    }));

    if (toInsert.length > 0) {
      const { error } = await admin.from('knowledge_chunks').insert(toInsert);
      if (error && /tags/i.test(error.message || '')) {
        const withoutTags = toInsert.map(({ tags: _tags, ...row }) => row);
        const retry = await admin.from('knowledge_chunks').insert(withoutTags);
        if (retry.error) throw retry.error;
      } else if (error) {
        throw error;
      }
    }
    newChunksAdded = toInsert.length;
    totalExisting = toInsert.length;
  }

  const { data: updated } = await admin
    .from('resumes')
    .update({
      content: resumeContent,
      is_corpus: true,
      corpus_type: corpusType,
      corpus_source: 'google_doc',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('name', resumeName)
    .select('id');

  let resumeUpdated = Boolean(updated?.length);
  if (!resumeUpdated) {
    const { data: inserted } = await admin
      .from('resumes')
      .insert({
        user_id: userId,
        name: resumeName,
        type: 'technical',
        content: resumeContent,
        ats_score: 0,
        is_corpus: true,
        corpus_type: corpusType,
        corpus_source: 'google_doc',
      })
      .select('id');
    resumeUpdated = Boolean(inserted?.length);
  }

  return {
    docContent,
    resumeContent,
    chunksExtracted,
    newChunksAdded,
    totalExisting,
    resumeUpdated,
  };
}
