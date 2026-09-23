import { pickMatchedResumeName, buildResumeUserPrompt, ATS_SYSTEM_PROMPT, buildGroqResumeUserPrompt } from './prompt.ts';
import { canonicalizeAtsResumeOutput } from '../ai/validate-resume.ts';

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

Deno.test('ATS prompt asks for SELECTED PROJECTS, not the old section name', () => {
  if (!ATS_SYSTEM_PROMPT.includes('SELECTED PROJECTS')) {
    throw new Error('prompt does not name the SELECTED PROJECTS section');
  }
  // The only permitted mention of the old name is the "do not use as a header" ban.
  const banned = ATS_SYSTEM_PROMPT.split('\n')
    .filter((line) => line.includes('PERSONAL PROJECTS'))
    .filter((line) => !line.includes('Do not use'));
  if (banned.length) {
    throw new Error(`prompt still instructs the old section name:\n${banned.join('\n')}`);
  }
});

Deno.test('ATS prompt specifies the project Type line and its allowed values', () => {
  if (!ATS_SYSTEM_PROMPT.includes('- Type: Official')) {
    throw new Error('prompt does not show the Official type line');
  }
  if (!ATS_SYSTEM_PROMPT.includes('- Type: Personal')) {
    throw new Error('prompt does not show the Personal type line');
  }
  // Grounding: the model must not guess a type the source does not support.
  if (!ATS_SYSTEM_PROMPT.includes('omit that project')) {
    throw new Error('prompt does not tell the model to omit an unclear type');
  }
});

Deno.test('Groq fallback prompt carries the same project contract', () => {
  const prompt = buildGroqResumeUserPrompt({
    jobTitle: 'Cloud Architect',
    company: 'Acme',
    jobDescription: 'Need Kubernetes.',
    sourceResume: 'NAME\nJane',
  });
  if (!prompt.includes('SELECTED PROJECTS')) {
    throw new Error('Groq prompt still uses the old section name');
  }
  if (!prompt.includes('Type:')) {
    throw new Error('Groq prompt does not mention the Type line');
  }
});

Deno.test('every project header the prompt bans canonicalizes to SELECTED PROJECTS', () => {
  // Guards the prompt/validator agreement: anything the prompt forbids as a
  // header must still be recoverable by the validator rather than swallowed.
  for (const alias of ['PERSONAL PROJECTS', 'PROJECTS']) {
    const text = `NAME\nJane Doe\n\nCONTACT\njane@example.com\n\nSUMMARY\nEngineer.\n\nSKILLS\nTypeScript\n\nPROFESSIONAL EXPERIENCE\nAcme\n- Shipped APIs.\n\n${alias}\nSide App | Solo Developer\n- Technologies: React\n- Built a dashboard.\n\nEDUCATION\nB.S.\n`;
    const canonical = canonicalizeAtsResumeOutput(text);
    if (!/^SELECTED PROJECTS$/m.test(canonical)) {
      throw new Error(`${alias} was not canonicalized\n${canonical}`);
    }
  }
});
