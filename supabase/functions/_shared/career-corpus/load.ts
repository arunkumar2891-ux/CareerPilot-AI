import { createAdminClient } from '../supabase-admin.ts';
import { getUserSettings } from '../credentials.ts';
import { generateText } from '../ai/router.ts';
import { extractAtsSection } from '../ai/validate-resume.ts';
import {
  applyContactOverlay,
  buildRoleMatchUserPrompt,
  formatContact,
  pickMatchedResumeName,
  ROLE_MATCH_SYSTEM_PROMPT,
} from './prompt.ts';

const MASTER_NAME = 'Master ATS (bullet bank)';

export interface CareerCorpusRow {
  name: string;
  content: string | null;
  corpus_type?: string | null;
}

export interface CareerCorpusBundle {
  sourceResume: string;
  sourceName: string;
  sourceKind: 'master' | 'role_specific';
  contactBlock: string;
  contact: Record<string, string | undefined>;
  groundingSource: string;
  educationSource: string;
}

function isMasterRow(row: CareerCorpusRow): boolean {
  return row.corpus_type === 'master' || row.name === MASTER_NAME;
}

const MIN_MASTER_CHARS = 80;

export async function userHasMasterResume(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('resumes')
    .select('name, content, corpus_type')
    .eq('user_id', userId)
    .eq('is_corpus', true);
  if (error) throw error;
  return ((data || []) as CareerCorpusRow[]).some(
    (row) => isMasterRow(row) && String(row.content || '').trim().length >= MIN_MASTER_CHARS,
  );
}

function isRoleSpecificRow(row: CareerCorpusRow): boolean {
  return row.corpus_type === 'role_specific' || row.name.startsWith('ATS Bank: ');
}

function roleDisplayName(name: string): string {
  return name.replace(/^ATS Bank:\s*/i, '').trim() || name;
}

export async function matchRoleSpecificResume(
  rows: CareerCorpusRow[],
  context: { jobTitle?: string; jobDescription?: string },
  userId?: string,
): Promise<CareerCorpusRow | null> {
  const roleRows = rows.filter((row) => isRoleSpecificRow(row) && String(row.content || '').trim().length > 200);
  if (!roleRows.length) return null;
  const jobTitle = String(context.jobTitle || '').trim();
  if (!jobTitle) return null;

  const names = roleRows.map((row) => roleDisplayName(row.name));
  try {
    const raw = await generateText({
      systemPrompt: ROLE_MATCH_SYSTEM_PROMPT,
      userPrompt: buildRoleMatchUserPrompt({
        jobTitle,
        jobDescription: context.jobDescription,
        resumeNames: names,
      }),
      operation: 'chat',
    }, { userId });
    const matched = pickMatchedResumeName(raw, names);
    if (matched === 'master') return null;
    return roleRows.find((row) => roleDisplayName(row.name) === matched) || null;
  } catch {
    return null;
  }
}

export async function loadMasterResumeText(userId: string): Promise<{ text: string; name: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('resumes')
    .select('name, content, corpus_type')
    .eq('user_id', userId)
    .eq('is_corpus', true);
  if (error) throw error;
  const rows = (data || []) as CareerCorpusRow[];
  const master = rows.find(isMasterRow);
  const text = String(master?.content || '').trim();
  if (text.length < MIN_MASTER_CHARS) {
    throw new Error('Add a master resume on the Corpus page before scoring jobs.');
  }
  return { text, name: String(master?.name || MASTER_NAME) };
}

export async function loadCareerCorpus(
  userId: string,
  jobDescription: string,
  context?: { jobTitle?: string; company?: string },
): Promise<CareerCorpusBundle> {
  const admin = createAdminClient();
  const [resumeQuery, settings] = await Promise.all([
    admin.from('resumes')
      .select('name, content, corpus_type')
      .eq('user_id', userId)
      .eq('is_corpus', true),
    getUserSettings(userId),
  ]);
  if (resumeQuery.error) throw resumeQuery.error;

  let rows = (resumeQuery.data || []) as CareerCorpusRow[];
  if (!rows.length) {
    const fallback = await admin.from('resumes').select('name, content, corpus_type').eq('user_id', userId);
    if (fallback.error) throw fallback.error;
    rows = (fallback.data || []) as CareerCorpusRow[];
  }

  const masterRow = rows.find(isMasterRow);
  if (!masterRow?.content?.trim()) {
    throw new Error('Add a master resume on the Corpus page (Google Doc sync or file upload) before generating a tailored resume.');
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

  const matchedRole = await matchRoleSpecificResume(rows, {
    jobTitle: context?.jobTitle,
    jobDescription,
  }, userId);
  const selected = matchedRole || masterRow;
  const sourceResume = applyContactOverlay(String(selected.content || ''), contact);
  const contactBlock = formatContact(contact);
  const educationSource = extractAtsSection(sourceResume, 'EDUCATION');

  return {
    sourceResume,
    sourceName: selected.name,
    sourceKind: matchedRole ? 'role_specific' : 'master',
    contactBlock,
    contact,
    groundingSource: [sourceResume, contactBlock].filter(Boolean).join('\n\n'),
    educationSource,
  };
}
