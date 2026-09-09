import { MASTER_RESUME_NAME, TWO_PAGE_RESUME_NAME } from '@/content/career-corpus';
import type { Resume } from '@/types';

export function isCorpusResumeName(name: string): boolean {
  if (name === MASTER_RESUME_NAME || name === TWO_PAGE_RESUME_NAME) return true;
  return name.startsWith('ATS Bank: ');
}

export function isCorpusResume(resume: Pick<Resume, 'name' | 'jobId' | 'isCorpus' | 'corpusType'>): boolean {
  if (resume.isCorpus) return true;
  if (resume.corpusType === 'master' || resume.corpusType === 'role_specific') return true;
  if (resume.jobId) return false;
  if (resume.name.startsWith('Tailored:')) return false;
  return isCorpusResumeName(resume.name);
}

export function isJobResume(resume: Pick<Resume, 'name' | 'jobId' | 'isCorpus' | 'corpusType'>): boolean {
  return !isCorpusResume(resume);
}

export type ResumeKind = 'job' | 'corpus';

export function corpusGroup(resume: Pick<Resume, 'name' | 'corpusType'>): 'master' | 'role_specific' | 'other' {
  if (resume.corpusType === 'master' || resume.name === MASTER_RESUME_NAME) return 'master';
  if (resume.corpusType === 'role_specific' || resume.name.startsWith('ATS Bank: ')) return 'role_specific';
  return 'other';
}

const MIN_MASTER_CHARS = 80;

export function hasUsableMasterResume(
  resumes: Array<Pick<Resume, 'name' | 'corpusType' | 'content'>>,
): boolean {
  return resumes.some((resume) => corpusGroup(resume) === 'master' && resume.content.trim().length >= MIN_MASTER_CHARS);
}
