import { pickMatchedResumeName, buildResumeUserPrompt, ATS_SYSTEM_PROMPT, buildGroqResumeUserPrompt, extractContactWebsite, formatContact, applyContactOverlay } from './prompt.ts';
import { canonicalizeAtsResumeOutput, validateResumeOutput } from '../ai/validate-resume.ts';

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

function masterWithContact(contactBody: string, tail = ''): string {
  return `NAME
ARUNKUMAR JS

CONTACT
${contactBody}

SUMMARY
Engineer.

SKILLS
TypeScript

PROFESSIONAL EXPERIENCE
Acme
- Shipped APIs.
${tail}
EDUCATION
- B.Tech`;
}

const MASTER_CONTACT = `Email: a@b.com
Phone: +91 6380069156
Location: Chennai, Tamil Nadu
LinkedIn: https://linkedin.com/in/x
GitHub: https://github.com/x
Website: https://arunkumar.dev`;

Deno.test('extractContactWebsite pulls the website from a master resume CONTACT block', () => {
  if (extractContactWebsite(masterWithContact(MASTER_CONTACT)) !== 'https://arunkumar.dev') {
    throw new Error('website was not extracted');
  }
  for (const label of ['Portfolio', 'Homepage', 'Site', 'website', 'Website  ']) {
    const text = masterWithContact(MASTER_CONTACT.replace('Website:', `${label.trim()}:`));
    if (extractContactWebsite(text) !== 'https://arunkumar.dev') {
      throw new Error(`label "${label}" was not recognized`);
    }
  }
});

Deno.test('extractContactWebsite returns empty for absent, placeholder, or no-contact input', () => {
  if (extractContactWebsite(masterWithContact('Email: a@b.com')) !== '') {
    throw new Error('expected empty when no website line exists');
  }
  const placeholder = masterWithContact(MASTER_CONTACT.replace('https://arunkumar.dev', '[Website URL]'));
  if (extractContactWebsite(placeholder) !== '') {
    throw new Error('unfilled placeholder should not be treated as a website');
  }
  if (extractContactWebsite('') !== '') throw new Error('empty input should be empty');
});

Deno.test('extractContactWebsite ignores a site line outside the CONTACT section', () => {
  // A project meta line must never be mistaken for the personal site.
  const withDecoy = masterWithContact('Email: a@b.com', `
SELECTED PROJECTS
My Thing | Solo Developer
- Site: https://decoy.example
- Built a thing.
`);
  if (extractContactWebsite(withDecoy) !== '') {
    throw new Error('picked up a site line from outside CONTACT');
  }
});

Deno.test('formatContact places Website directly after GitHub', () => {
  const block = formatContact({
    fullName: 'Arunkumar JS',
    email: 'a@b.com',
    phone: '+91 6380069156',
    location: 'Chennai, Tamil Nadu',
    linkedin: 'https://linkedin.com/in/x',
    github: 'https://github.com/x',
    website: 'https://arunkumar.dev',
  });
  const labels = block.split('\n').map((line) => line.split(':')[0]);
  const githubAt = labels.indexOf('GitHub');
  if (githubAt < 0) throw new Error('GitHub line missing');
  if (labels[githubAt + 1] !== 'Website') {
    throw new Error(`Website is not directly after GitHub\n${block}`);
  }
});

Deno.test('formatContact omits Website when the resume has none', () => {
  const block = formatContact({ email: 'a@b.com', github: 'https://github.com/x' });
  if (/Website:/i.test(block)) throw new Error(`emitted an empty Website line\n${block}`);
});

Deno.test('formatContact never emits the PANW start date as a contact line', () => {
  // This block is copied verbatim into the resume's CONTACT section, so an
  // internal prompt hint here shows up in every generated resume.
  const block = formatContact({
    fullName: 'ARUNKUMAR JS',
    email: 'a@b.com',
    github: 'https://github.com/x',
    startDate: 'Jul 2024',
  });
  if (/PANW/i.test(block)) throw new Error(`PANW start leaked into the contact block\n${block}`);
  if (/Jul 2024/.test(block)) throw new Error(`start date leaked into the contact block\n${block}`);
});

Deno.test('the start date still substitutes [Start Date] in the master resume', () => {
  // Dropping it from the contact block must not break its actual purpose.
  const master = `PROFESSIONAL EXPERIENCE
PALO ALTO NETWORKS | Engineer
[Start Date] - Present | Chennai
- Shipped APIs.`;
  const overlaid = applyContactOverlay(master, { startDate: 'Jul 2024' });
  if (!overlaid.includes('Jul 2024 - Present')) {
    throw new Error(`[Start Date] was not substituted\n${overlaid}`);
  }
  if (overlaid.includes('[Start Date]')) {
    throw new Error(`token left behind\n${overlaid}`);
  }
});

Deno.test('a legacy PANW start line is stripped from an existing resume', () => {
  const legacy = `NAME
ARUNKUMAR JS

CONTACT
Email: a@b.com
PANW start: Jul 2024

SUMMARY
Engineer.

SKILLS
TypeScript

PROFESSIONAL EXPERIENCE
Acme
- Shipped APIs.

EDUCATION
- B.Tech`;
  const canonical = canonicalizeAtsResumeOutput(legacy);
  if (/PANW/i.test(canonical)) {
    throw new Error(`legacy PANW line survived canonicalization\n${canonical}`);
  }
  // And via the identity overlay, which writes its block in verbatim.
  const staleBlock = 'Name: ARUNKUMAR JS\nEmail: a@b.com\nPANW start: Jul 2024';
  const checked = validateResumeOutput(legacy, {
    skipGrounding: true,
    identity: { name: 'ARUNKUMAR JS', contact: staleBlock, education: '- B.Tech' },
  });
  if (!checked.ok) throw new Error(`expected resume to validate: ${checked.reason}`);
  if (/PANW/i.test(checked.text)) {
    throw new Error(`PANW line survived the identity overlay\n${checked.text}`);
  }
});

Deno.test('a website in the contact block survives the identity overlay into the final resume', () => {
  // Regression: overlayIdentitySections() replaces CONTACT wholesale, so a
  // website only reaches the PDF if it is present in the contact block.
  const contactBlock = formatContact({
    fullName: 'ARUNKUMAR JS',
    email: 'a@b.com',
    github: 'https://github.com/x',
    website: extractContactWebsite(masterWithContact(MASTER_CONTACT)),
  });
  const modelOutput = masterWithContact('Email: dropped@example.com');
  const checked = validateResumeOutput(modelOutput, {
    skipGrounding: true,
    identity: { name: 'ARUNKUMAR JS', contact: contactBlock, education: '- B.Tech' },
  });
  if (!checked.ok) throw new Error(`expected resume to validate: ${checked.reason}`);
  if (!/^Website: https:\/\/arunkumar\.dev$/m.test(checked.text)) {
    throw new Error(`website did not survive the identity overlay\n${checked.text}`);
  }
});
