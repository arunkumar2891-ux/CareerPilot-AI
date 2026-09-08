import type { DeterministicResumeInput } from '../ai/types.ts';
import { loadCareerCorpus, type CareerCorpusBundle } from './load.ts';
import { ATS_SYSTEM_PROMPT, buildGroqResumeUserPrompt, buildResumeUserPrompt } from './prompt.ts';

export interface PreparedResumeGeneration {
  corpus: CareerCorpusBundle;
  systemPrompt: string;
  userPrompt: string;
  groundingSource: string;
  mandatorySections: {
    skillsSource: string;
    educationSource: string;
    groqUserPrompt: string;
    deterministicResume: DeterministicResumeInput;
  };
}

/** One generation contract for workflow nodes and manual job tailoring. */
export async function prepareResumeGeneration(
  userId: string,
  input: {
    jobDescription: string;
    jobTitle?: string;
    company?: string;
    googleHeader?: string;
  },
): Promise<PreparedResumeGeneration> {
  const corpus = await loadCareerCorpus(userId, input.jobDescription, {
    jobTitle: input.jobTitle,
    company: input.company,
  });

  const shared = {
    jobTitle: input.jobTitle,
    company: input.company,
    jobDescription: input.jobDescription,
    bulletCatalog: corpus.bulletCatalog,
    retrievedEvidence: corpus.retrievedEvidence,
    rerankedSelection: corpus.rerankedSelection,
    contactBlock: corpus.contactBlock,
    skillsSource: corpus.skillsSource,
    educationSource: corpus.educationSource,
    summarySource: corpus.summarySource,
  };

  const userPrompt = buildResumeUserPrompt({
    ...shared,
    playbookTitle: corpus.playbookTitle,
    playbookInstructions: corpus.playbookInstructions,
    masterResume: corpus.masterResume,
    twoPageTemplate: corpus.twoPageTemplate,
    lexicalMatches: corpus.lexicalMatches,
    googleHeader: input.googleHeader,
  });
  const groqUserPrompt = buildGroqResumeUserPrompt(shared);

  return {
    corpus,
    systemPrompt: ATS_SYSTEM_PROMPT,
    userPrompt,
    groundingSource: corpus.groundingSource,
    mandatorySections: {
      skillsSource: corpus.skillsSource,
      educationSource: corpus.educationSource,
      groqUserPrompt,
      deterministicResume: {
        contactBlock: corpus.contactBlock,
        summarySource: corpus.summarySource,
        skillsSource: corpus.skillsSource,
        educationSource: corpus.educationSource,
        rerankedBulletIds: corpus.rerankedBulletIds,
        catalog: corpus.catalog,
      },
    },
  };
}
