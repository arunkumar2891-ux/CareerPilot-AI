/**
 * Multi-user safety of the contact/identity overlay.
 *
 * These pin the fixes for the audit findings where one user's biographical
 * details were compiled into every other user's resume:
 *  - a hardcoded `DEFAULT_EDUCATION` used as a global fallback degree
 *  - a rewrite that replaced a real Anna University degree with it
 *  - a name overlay anchored to `/^ARUN KUMAR/m`
 *  - a title overlay matching two literal taglines
 */
import {
  applyContactOverlay,
  overlayResumeHeader,
  replaceEducationPlaceholders,
} from './prompt.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg ?? 'mismatch'}\n  actual:   ${actual}\n  expected: ${expected}`);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const REAL_DEGREE = 'Bachelor of Engineering in Computer Science\nAnna University | Chennai';

Deno.test('a real Anna University degree survives untouched', () => {
  // The original code regex-replaced exactly this with one person's B.Tech.
  const resume = `EDUCATION\n${REAL_DEGREE}`;
  const out = replaceEducationPlaceholders(resume, undefined);
  assert(out.includes('Bachelor of Engineering in Computer Science'), 'degree was destroyed');
  assert(out.includes('Anna University'), 'university was destroyed');
  assert(!out.includes('SASTRA'), 'a different university was substituted');
});

Deno.test('a real degree survives even when the user configured their own', () => {
  const resume = `EDUCATION\n${REAL_DEGREE}`;
  const out = replaceEducationPlaceholders(resume, 'M.S. in Data Science\nMIT');
  // Only the placeholder block is a substitution target, never real content.
  assert(out.includes('Anna University'), 'real degree was overwritten');
  assert(!out.includes('MIT'), 'configured education leaked over real content');
});

Deno.test('no hardcoded degree is emitted when the user configured none', () => {
  const resume = 'EDUCATION\n[Degree Name]\n[University Name]';
  const out = replaceEducationPlaceholders(resume, undefined);
  assert(out.includes('[Degree Name]'), 'placeholder should stay visible');
  assert(!out.includes('SASTRA'), 'invented a university');
  assert(!out.includes('B.Tech'), 'invented a degree');
});

Deno.test('placeholders are filled from the user own education', () => {
  const resume = 'EDUCATION\n[Degree Name]\n[University Name]\n[Graduation Year]';
  const out = replaceEducationPlaceholders(resume, 'B.S. in Physics\nCaltech | Pasadena');
  assert(out.includes('B.S. in Physics'), 'degree missing');
  assert(out.includes('Caltech | Pasadena'), 'university missing');
  assert(!out.includes('[Degree Name]'), 'placeholder left behind');
  assert(!out.includes('[Graduation Year]'), 'graduation year placeholder left behind');
});

Deno.test('name overlay works for a user who is not the original author', () => {
  const resume = 'PRIYA SHARMA\nStaff Engineer | Platform Lead\n\nCONTACT\nPhone: 1';
  const out = overlayResumeHeader(resume, 'Wei Chen', undefined);
  assert(out.startsWith('WEI CHEN'), `name not applied: ${out.split('\n')[0]}`);
  assert(!out.includes('PRIYA SHARMA'), 'old name still present');
});

Deno.test('title overlay works for an arbitrary tagline', () => {
  const resume = 'PRIYA SHARMA\nStaff Engineer | Platform Lead\n\nCONTACT';
  const out = overlayResumeHeader(resume, undefined, 'Principal Architect');
  assertEquals(out.split('\n')[1], 'Principal Architect', 'tagline not replaced');
  assert(out.startsWith('PRIYA SHARMA'), 'name should be untouched');
});

Deno.test('overlay handles a NAME section header before the name', () => {
  const resume = 'NAME\nPriya Sharma\nStaff Engineer | Platform Lead';
  const out = overlayResumeHeader(resume, 'Wei Chen', 'Principal Architect');
  const lines = out.split('\n');
  assertEquals(lines[0], 'NAME', 'NAME header was clobbered');
  assertEquals(lines[1], 'WEI CHEN', 'name not applied after NAME header');
  assertEquals(lines[2], 'Principal Architect', 'title not applied after NAME header');
});

Deno.test('overlay does not overwrite a section header when there is no name line', () => {
  const resume = 'CONTACT\nPhone: 555-0100\nEmail: a@b.c';
  const out = overlayResumeHeader(resume, 'Wei Chen', 'Principal Architect');
  assertEquals(out, resume, 'a section header was mistaken for the name');
});

Deno.test('overlay leaves a contact line alone as a tagline candidate', () => {
  // `Phone: ...` contains a colon, so it must not be treated as a tagline.
  const resume = 'PRIYA SHARMA\nPhone: 555-0100';
  const out = overlayResumeHeader(resume, undefined, 'Principal Architect');
  assert(out.includes('Phone: 555-0100'), 'a contact line was overwritten by the title');
});

Deno.test('overlay leaves a line without a pipe alone as a tagline', () => {
  const resume = 'PRIYA SHARMA\nExperienced engineer building distributed systems';
  const out = overlayResumeHeader(resume, undefined, 'Principal Architect');
  assert(out.includes('Experienced engineer'), 'prose line was overwritten by the title');
});

Deno.test('overlay is a no-op when neither name nor title is configured', () => {
  const resume = 'PRIYA SHARMA\nStaff Engineer | Platform Lead';
  assertEquals(overlayResumeHeader(resume, undefined, undefined), resume, 'unexpected change');
});

Deno.test('applyContactOverlay threads name, title and education for any user', () => {
  const resume = [
    'PRIYA SHARMA',
    'Staff Engineer | Platform Lead',
    '',
    'CONTACT',
    'Phone: [Phone Number]',
    '',
    'EDUCATION',
    '[Degree Name]',
    '[University Name]',
  ].join('\n');
  const out = applyContactOverlay(resume, {
    fullName: 'Wei Chen',
    title: 'Principal Architect',
    phone: '+1 555 0100',
    education: 'B.S. in Physics\nCaltech',
  });
  assert(out.startsWith('WEI CHEN'), 'name not applied');
  assert(out.includes('Principal Architect'), 'title not applied');
  assert(out.includes('Phone: +1 555 0100'), 'phone token not substituted');
  assert(out.includes('Caltech'), 'education not applied');
  assert(!out.includes('SASTRA'), 'hardcoded university leaked');
});

Deno.test('no source file ships a hardcoded default degree or name anchor', async () => {
  // Targets executable constructs, not prose: the doc comments deliberately
  // record what used to be here and why it was removed.
  const bannedCode = [
    'export const DEFAULT_EDUCATION',
    'SASTRA University | Thanjavur',
    'replace(/^ARUN KUMAR',
    'Bachelor of Engineering in Computer Science\\s*\\n',
  ];
  for (const path of ['./prompt.ts', '../../../../src/content/career-corpus/index.ts']) {
    const src = await Deno.readTextFile(new URL(path, import.meta.url));
    for (const banned of bannedCode) {
      assert(!src.includes(banned), `${path} still contains: ${banned}`);
    }
  }
});
