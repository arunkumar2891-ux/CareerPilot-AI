import {
  buildTailoredResumeName,
  parseTailoredJobKey,
  resumeStorageObjectPath,
  storedFileLogMessages,
  storedFileNameFromOutput,
} from './resume-store.ts';

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

Deno.test('resumeStorageObjectPath stores the readable PDF name under the user resumes folder', () => {
  const path = resumeStorageObjectPath('user-1', 'ExterroIndia_ArunKumar_MLEngineer_10092026.pdf');
  if (path !== 'user-1/resumes/ExterroIndia_ArunKumar_MLEngineer_10092026.pdf') {
    throw new Error(path);
  }
});

Deno.test('resumeStorageObjectPath strips path separators from the file name', () => {
  const path = resumeStorageObjectPath('user-1', '../../secret.pdf');
  if (path !== 'user-1/resumes/secret.pdf') throw new Error(path);
});

Deno.test('storedFileLogMessages follow the Upload to Storage completed line', () => {
  const name = 'ExterroIndia_ArunKumar_MLEngineer_10092026.pdf';
  const messages = storedFileLogMessages({
    fileName: name,
    storage_path: `user-1/resumes/${name}`,
  });
  if (messages.length !== 1) throw new Error(`expected 1 log, got ${messages.length}`);
  if (messages[0] !== `Stored file: ${name}`) throw new Error(messages[0]);
});

Deno.test('storedFileLogMessages emit one stored file per job in a batch', () => {
  const messages = storedFileLogMessages([
    { fileName: 'Acme_Arun_Engineer_10092026.pdf' },
    { skipped: true, reason: 'duplicate' },
    { fileName: 'Beta_Arun_Architect_10092026.pdf' },
  ]);
  if (messages.length !== 2) throw new Error(`expected 2 logs, got ${messages.length}`);
  if (!messages[0].includes('Acme_Arun_Engineer') || !messages[1].includes('Beta_Arun_Architect')) {
    throw new Error(messages.join(' | '));
  }
});

Deno.test('storedFileLogMessages skip duplicate/skipped jobs and empty uploads', () => {
  if (storedFileLogMessages({ skipped: true, reason: 'duplicate' }).length) {
    throw new Error('skipped jobs must not log a stored file');
  }
  if (storedFileLogMessages({ title: 'Engineer' }).length) {
    throw new Error('uploads without a file name must not log');
  }
});

Deno.test('storedFileNameFromOutput falls back to the storage path basename', () => {
  const name = storedFileNameFromOutput({
    storage_path: 'user-1/resumes/Acme_Arun_Engineer_10092026.pdf',
  });
  if (name !== 'Acme_Arun_Engineer_10092026.pdf') throw new Error(name);
});
