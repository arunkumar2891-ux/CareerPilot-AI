import { buildRoleBankUserPrompt, ROLE_BANK_SYSTEM_PROMPT } from './prompt.ts';
import { ROLE_PLAYBOOKS } from './data.ts';
import { resumeBankName } from './resume-bank.ts';

Deno.test('role-bank prompt treats Master ATS as the only factual source', () => {
  if (!ROLE_BANK_SYSTEM_PROMPT.includes('MASTER ATS is the only factual source')) {
    throw new Error('role-bank system prompt must lock facts to the Master ATS');
  }
  if (!ROLE_BANK_SYSTEM_PROMPT.includes('NAME, CONTACT, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, CERTIFICATION, EDUCATION')) {
    throw new Error('role-bank system prompt must use the 7-header contract');
  }
  if (ROLE_BANK_SYSTEM_PROMPT.includes('Target TWO PAGES')) {
    throw new Error('role-bank generation must not use the two-page trim');
  }

  const prompt = buildRoleBankUserPrompt({
    playbookTitle: 'Solutions Engineer',
    playbookInstructions: 'Lead with: CareerPilot AI',
    masterResume: 'MASTER SOURCE OF TRUTH',
    contactBlock: 'Name: Jane Doe',
    skillsSource: 'TypeScript',
    educationSource: 'B.Tech',
    certificationSource: 'GCP Architect',
  });
  if (!prompt.includes('MASTER SOURCE OF TRUTH')) throw new Error(prompt);
  if (!prompt.includes('comprehensive role-focused resume')) throw new Error(prompt);
  if (!prompt.includes('CERTIFICATION SOURCE')) {
    throw new Error('certification source should be injected');
  }
});

Deno.test('seven playbooks map to distinct ATS Bank names', () => {
  const names = ROLE_PLAYBOOKS.map((playbook) => resumeBankName(playbook));
  const expected = [
    'ATS Bank: Engineering Manager / Technical Lead',
    'ATS Bank: Cloud Architect / Platform Engineer',
    'ATS Bank: Forward Deployment Engineer',
    'ATS Bank: Solutions Engineer',
    'ATS Bank: GenAI Developer',
    'ATS Bank: AI Engineer',
    'ATS Bank: Integration Architect',
  ];
  if (names.length !== 7) throw new Error(`expected 7 playbooks, got ${names.length}`);
  for (const name of expected) {
    if (!names.includes(name)) throw new Error(`missing ${name}\n${names.join('\n')}`);
  }
  if (new Set(names).size !== names.length) throw new Error('duplicate role-bank names');
});

Deno.test('selectMasterResumeForJob prefers a stored comprehensive role bank', async () => {
  const { selectMasterResumeForJob } = await import('./resume-bank.ts');
  const playbook = {
    id: 'solutions_engineer',
    title: 'Solutions Engineer',
    leadWith: [],
    emphasize: [],
    highlight: [],
  };
  const bankName = resumeBankName(playbook);
  const selected = selectMasterResumeForJob('FULL MASTER', playbook, [
    { name: bankName, content: 'A'.repeat(600) },
  ]);
  if (selected.source !== 'role-bank') throw new Error(selected.source);
  if (selected.content !== 'A'.repeat(600)) throw new Error('should use stored role bank content');
});
