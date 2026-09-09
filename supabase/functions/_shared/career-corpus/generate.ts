import { loadCareerCorpus, type CareerCorpusBundle } from './load.ts';
import {
  ATS_SYSTEM_PROMPT,
  buildGroqResumeUserPrompt,
  buildResumeUserPrompt,
} from './prompt.ts';

export interface PreparedResumeGeneration {
  corpus: CareerCorpusBundle;
  systemPrompt: string;
  userPrompt: string;
  groqUserPrompt: string;
  groundingSource: string;
  identity: { name?: string; contact?: string; education?: string };
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

  const userPrompt = buildResumeUserPrompt({
    jobTitle: input.jobTitle,
    company: input.company,
    jobDescription: input.jobDescription,
    sourceResume: corpus.sourceResume,
    contactBlock: corpus.contactBlock,
    googleHeader: input.googleHeader,
  });
  const groqUserPrompt = buildGroqResumeUserPrompt({
    jobTitle: input.jobTitle,
    company: input.company,
    jobDescription: input.jobDescription,
    sourceResume: corpus.sourceResume,
    contactBlock: corpus.contactBlock,
  });

  return {
    corpus,
    systemPrompt: ATS_SYSTEM_PROMPT,
    userPrompt,
    groqUserPrompt,
    groundingSource: corpus.groundingSource,
    identity: {
      name: corpus.contact.fullName,
      contact: corpus.contactBlock || undefined,
      education: corpus.educationSource || undefined,
    },
  };
}
