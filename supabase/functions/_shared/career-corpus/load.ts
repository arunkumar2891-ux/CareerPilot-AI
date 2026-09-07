import { createAdminClient } from '../supabase-admin.ts';
import { getUserSettings } from '../credentials.ts';
import { ROLE_PLAYBOOKS, EVIDENCE_CHUNKS } from './data.ts';
import { selectMasterResumeForJob } from './resume-bank.ts';
import {
  applyContactOverlay,
  formatContact,
  pickPlaybook,
  playbookInstructions,
  selectLexicalMasterMatches,
  selectEvidence,
  retrievalTerms,
} from './prompt.ts';
import {
  buildBulletCatalog,
  buildCatalogGroundingSource,
  formatBulletCatalogBlock,
  formatRetrievedEvidenceBlock,
  formatRerankedSelection,
  matchEvidenceToCatalog,
  scoreRetrievalCandidates,
  selectCatalogLines,
} from './resume-bullets.ts';
import { rerankBulletsWithLlm } from './rerank-bullets.ts';

const MASTER_NAME = 'Master ATS (bullet bank)';
const TWO_PAGE_NAME = '2-page template';

export interface CareerCorpusBundle {
  masterResume: string;
  twoPageTemplate: string;
  playbookTitle: string;
  playbookId: string;
  masterResumeSource: 'role-bank' | 'generated';
  playbookInstructions: string;
  bulletCatalog: string;
  retrievedEvidence: string;
  rerankedSelection: string;
  lexicalMatches: string;
  groundingSource: string;
  contactBlock: string;
  contact: Record<string, string | undefined>;
  rerankedBulletIds: string[];
}

export async function loadCareerCorpus(
  userId: string,
  jobDescription: string,
  context?: { jobTitle?: string; company?: string },
): Promise<CareerCorpusBundle> {
  const admin = createAdminClient();
  const [{ data: resumes }, chunksQuery, settings] = await Promise.all([
    admin.from('resumes').select('name, content').eq('user_id', userId),
    admin.from('knowledge_chunks').select('source_id, tags, content').eq('user_id', userId).eq('collection', 'career'),
    getUserSettings(userId),
  ]);

  let chunks = chunksQuery.data;
  if (chunksQuery.error && /tags/i.test(chunksQuery.error.message || '')) {
    const fallback = await admin
      .from('knowledge_chunks')
      .select('source_id, content')
      .eq('user_id', userId)
      .eq('collection', 'career');
    if (fallback.error) throw fallback.error;
    chunks = fallback.data;
  } else if (chunksQuery.error) {
    throw chunksQuery.error;
  }

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
  const lexicalMatches = selectLexicalMasterMatches(fullMaster, jobDescription);
  const contactBlock = formatContact(contact);

  const catalog = buildBulletCatalog(fullMaster);
  const evidenceMatches = matchEvidenceToCatalog(evidenceChunks, catalog);
  const scoredCandidates = scoreRetrievalCandidates({
    catalog,
    roleBankText: masterResume,
    lexicalMatches,
    evidenceChunks,
    jobDescription,
    retrievalTerms: retrievalTerms(jobDescription),
  });

  const rerankedBulletIds = await rerankBulletsWithLlm(
    scoredCandidates,
    {
      jobTitle: context?.jobTitle,
      company: context?.company,
      playbookTitle: playbook.title,
      jobDescription,
    },
    userId,
  );

  const priorityLines = selectCatalogLines(catalog, rerankedBulletIds);
  const bulletCatalog = formatBulletCatalogBlock(priorityLines.length ? priorityLines : catalog.slice(0, 40));
  const retrievedEvidence = formatRetrievedEvidenceBlock(evidenceMatches);
  const rerankedSelection = formatRerankedSelection(rerankedBulletIds);
  const groundingSource = buildCatalogGroundingSource(catalog, [contactBlock]);

  return {
    masterResume,
    twoPageTemplate: applyContactOverlay(String(twoPageRow?.content || ''), contact),
    playbookTitle: playbook.title,
    playbookId: playbook.id,
    masterResumeSource: selectedResume.source,
    playbookInstructions: playbookInstructions(playbook),
    bulletCatalog,
    retrievedEvidence,
    rerankedSelection,
    lexicalMatches,
    groundingSource,
    contactBlock,
    contact,
    rerankedBulletIds,
  };
}
