import { createAdminClient } from './supabase-admin.ts';
import { refreshGoogleToken, getUserSettings } from './credentials.ts';
import { ROLE_PLAYBOOKS } from './career-corpus/data.ts';
import { applyContactOverlay } from './career-corpus/prompt.ts';
import { buildFocusedMasterResume, resumeBankName } from './career-corpus/resume-bank.ts';

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

export async function fetchGoogleDocText(userId: string, fileId: string): Promise<string> {
  const accessToken = await refreshGoogleToken(userId);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message || 'Failed to fetch Google Doc',
    );
  }
  return await res.text();
}

async function syncRoleResumeBanks(userId: string, masterContent: string): Promise<number> {
  const admin = createAdminClient();
  const settings = await getUserSettings(userId);
  const { data: profile } = await admin.from('profiles').select('full_name, title, email').eq('user_id', userId).maybeSingle();
  const stored = (settings.contact as Record<string, string> | undefined) || {};
  const contact: Record<string, string | undefined> = {
    fullName: profile?.full_name || stored.fullName,
    title: profile?.title || stored.title,
    email: stored.email || profile?.email,
    phone: stored.phone,
    location: stored.location,
    linkedin: stored.linkedin,
    github: stored.github,
    startDate: stored.startDate,
  };
  const fullMaster = applyContactOverlay(masterContent, contact);
  let count = 0;

  for (const playbook of ROLE_PLAYBOOKS) {
    const name = resumeBankName(playbook);
    const focused = applyContactOverlay(buildFocusedMasterResume(fullMaster, playbook), contact);
    const { data: existing } = await admin
      .from('resumes')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name)
      .maybeSingle();

    if (existing?.id) {
      await admin.from('resumes').update({
        content: focused,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await admin.from('resumes').insert({
        user_id: userId,
        name,
        type: 'technical',
        content: focused,
        ats_score: 0,
      });
    }
    count++;
  }

  return count;
}

export async function syncGoogleDocToCorpus(userId: string, fileId: string): Promise<{
  docContent: string;
  resumeContent: string;
  chunksExtracted: number;
  newChunksAdded: number;
  totalExisting: number;
  resumeUpdated: boolean;
}> {
  const docContent = await fetchGoogleDocText(userId, fileId);
  const resumeContent = parseGoogleDocResume(docContent);
  const chunks = extractChunksFromDoc(docContent);
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('knowledge_chunks')
    .select('content')
    .eq('user_id', userId)
    .eq('collection', 'career');
  const existingTexts = new Set(
    (existing || []).map((c) => String(c.content || '').toLowerCase().replace(/\s+/g, ' ')),
  );

  const toInsert = chunks
    .filter((c) => !existingTexts.has(c.text.toLowerCase().replace(/\s+/g, ' ')))
    .map((c) => ({
      user_id: userId,
      collection: 'career',
      source_id: c.id,
      tags: c.tags,
      content: c.text,
    }));

  if (toInsert.length > 0) {
    await admin.from('knowledge_chunks').insert(toInsert);
  }

  const { data: updated } = await admin
    .from('resumes')
    .update({ content: resumeContent, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('name', MASTER_RESUME_NAME)
    .select('id');

  let resumeUpdated = Boolean(updated?.length);
  if (!resumeUpdated) {
    const { data: inserted } = await admin
      .from('resumes')
      .insert({
        user_id: userId,
        name: MASTER_RESUME_NAME,
        type: 'technical',
        content: resumeContent,
        ats_score: 0,
      })
      .select('id');
    resumeUpdated = Boolean(inserted?.length);
  }

  if (resumeUpdated || resumeContent.length > 500) {
    await syncRoleResumeBanks(userId, resumeContent);
  }

  return {
    docContent,
    resumeContent,
    chunksExtracted: chunks.length,
    newChunksAdded: toInsert.length,
    totalExisting: (existing || []).length + toInsert.length,
    resumeUpdated: Boolean(updated?.length),
  };
}
