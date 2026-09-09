import { pickMatchedResumeName, buildResumeUserPrompt } from './prompt.ts';

Deno.test('pickMatchedResumeName returns master for empty or unmatched replies', () => {
  if (pickMatchedResumeName('', ['FDE']) !== 'master') throw new Error('empty');
  if (pickMatchedResumeName('none', ['FDE']) !== 'master') throw new Error('none');
});

Deno.test('buildResumeUserPrompt is resume + JD only', () => {
  const prompt = buildResumeUserPrompt({
    jobTitle: 'Cloud Architect',
    company: 'Acme',
    jobDescription: 'Need Kubernetes.',
    sourceResume: 'NAME\nJane\nPROFESSIONAL EXPERIENCE\n- Ran GKE.',
    contactBlock: 'Name: Jane',
  });
  if (!prompt.includes('RESUME:')) throw new Error('missing resume');
  if (prompt.includes('BULLET CATALOG') || prompt.includes('MATCHED PLAYBOOK')) {
    throw new Error('legacy prompt blocks still present');
  }
});
