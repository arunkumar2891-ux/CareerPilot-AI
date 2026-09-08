import { buildTailoredResumeName, parseTailoredJobKey } from './resume-store.ts';

Deno.test('buildTailoredResumeName includes a stable job key so same company+role stays unique', () => {
  const a = buildTailoredResumeName('DevRev', 'Forward Deployed Engineer', 'ea66d0d9-9690-46a7-ba15-3e0537c2aae6');
  const b = buildTailoredResumeName('DevRev', 'Forward Deployed Engineer', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  if (a === b) throw new Error(`expected distinct names, both were ${a}`);
  if (!a.includes('DevRev') || !a.includes('Forward Deployed Engineer')) {
    throw new Error(`missing company/role: ${a}`);
  }
  if (!a.includes('ea66d0d9')) throw new Error(`missing job key: ${a}`);
  if (a.length > 120) throw new Error(`name exceeds 120 chars: ${a.length}`);
});

Deno.test('buildTailoredResumeName keeps the job key when company+role is long', () => {
  const name = buildTailoredResumeName(
    'A Very Long Company Name That Would Overflow The Title Field',
    'Senior Forward Deployed Engineer And Integration Architect',
    'ea66d0d9-9690-46a7-ba15-3e0537c2aae6',
  );
  if (!name.endsWith('(ea66d0d9)')) throw new Error(`job key was truncated: ${name}`);
  if (name.length > 120) throw new Error(`name exceeds 120 chars: ${name.length}`);
});

Deno.test('parseTailoredJobKey reads the suffix from a tailored name', () => {
  const name = buildTailoredResumeName('Acme', 'Engineer', 'ea66d0d9-9690-46a7-ba15-3e0537c2aae6');
  if (parseTailoredJobKey(name) !== 'ea66d0d9') throw new Error(`parsed ${parseTailoredJobKey(name)} from ${name}`);
  if (parseTailoredJobKey('Tailored: Acme Engineer') !== null) throw new Error('legacy name should have no key');
});
