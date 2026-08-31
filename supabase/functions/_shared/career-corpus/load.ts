import { createAdminClient } from '../supabase-admin.ts';
import { getUserSettings } from '../credentials.ts';
import { ROLE_PLAYBOOKS, EVIDENCE_CHUNKS } from './data.ts';
import { selectMasterResumeForJob } from './resume-bank.ts';
import {
  applyContactOverlay,
  formatContact,
  pickPlaybook,
  playbookInstructions,
  selectEvidence,
} from './prompt.ts';

const MASTER_NAME = 'Master ATS (bullet bank)';
const TWO_PAGE_NAME = '2-page template';

export interface CareerCorpusBundle {
  masterResume: string;
  twoPageTemplate: string;
  playbookTitle: string;
  playbookId: string;
  masterResumeSource: 'role-bank' | 'generated';
  playbookInstructions: string;
  evidence: string;
  contactBlock: string;
  contact: Record<string, string | undefined>;
}

export async function loadCareerCorpus(userId: string, jobDescription: string): Promise<CareerCorpusBundle> {
  const admin = createAdminClient();
  const [{ data: resumes }, { data: chunks }, settings] = await Promise.all([
    admin.from('resumes').select('name, content').eq('user_id', userId),
    admin.from('knowledge_chunks').select('source_id, tags, content').eq('user_id', userId).eq('collection', 'career'),
    getUserSettings(userId),
  ]);

  const masterRow = (resumes || []).find((r) => r.name === MASTER_NAME);
  const twoPageRow = (resumes || []).find((r) => r.name === TWO_PAGE_NAME);
  if (!masterRow?.content) {
    throw new Error('Career corpus not seeded. Open the app once while signed in so Master ATS can be created.');
  }

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

  const dbChunks = (chunks || []).map((c) => ({
    id: String(c.source_id || ''),
    tags: (c.tags as string[]) || [],
    text: String(c.content || ''),
  }));
  const pool = dbChunks.length ? dbChunks : [...EVIDENCE_CHUNKS];
  const evidenceChunks = selectEvidence(jobDescription, pool);

  const { playbook } = pickPlaybook(jobDescription, [...ROLE_PLAYBOOKS]);

  const fullMaster = applyContactOverlay(String(masterRow.content), contact);
  const resumeRows = (resumes || []).map((r) => ({
    name: String(r.name),
    content: r.content as string | null,
  }));
  const selectedResume = selectMasterResumeForJob(fullMaster, playbook, resumeRows);
  const masterResume = applyContactOverlay(selectedResume.content, contact);

  return {
    masterResume,
    twoPageTemplate: applyContactOverlay(String(twoPageRow?.content || ''), contact),
    playbookTitle: playbook.title,
    playbookId: playbook.id,
    masterResumeSource: selectedResume.source,
    playbookInstructions: playbookInstructions(playbook),
    evidence: evidenceChunks.map((c) => `- ${c.text}`).join('\n'),
    contactBlock: formatContact(contact),
    contact,
  };
}
