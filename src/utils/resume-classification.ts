import { MASTER_RESUME_NAME, TWO_PAGE_RESUME_NAME } from '@/content/career-corpus';
import { RESUME_BANK_PREFIX } from '@/content/career-corpus/resume-bank';
import type { Resume } from '@/types';

export function isCorpusResumeName(name: string): boolean {
  if (name === MASTER_RESUME_NAME || name === TWO_PAGE_RESUME_NAME) return true;
  return name.startsWith(`${RESUME_BANK_PREFIX} `);
}

export function isCorpusResume(resume: Pick<Resume, 'name' | 'jobId' | 'isCorpus'>): boolean {
  if (resume.isCorpus) return true;
  if (resume.jobId) return false;
  if (resume.name.startsWith('Tailored:')) return false;
  return isCorpusResumeName(resume.name);
}

export function isJobResume(resume: Pick<Resume, 'name' | 'jobId' | 'isCorpus'>): boolean {
  return !isCorpusResume(resume);
}

export type ResumeKind = 'job' | 'corpus';

export function corpusGroup(name: string): 'core' | 'role-bank' | 'other' {
  if (name === MASTER_RESUME_NAME || name === TWO_PAGE_RESUME_NAME) return 'core';
  if (name.startsWith(`${RESUME_BANK_PREFIX} `)) return 'role-bank';
  return 'other';
}
