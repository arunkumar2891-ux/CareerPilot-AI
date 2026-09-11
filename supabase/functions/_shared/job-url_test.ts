import { buildApifyJobSearchInput, buildLinkedInJobSearchUrl } from './job-url.ts';

Deno.test('remote-only LinkedIn URL sets f_WT=2 and keeps keywords as the role', () => {
  const url = buildLinkedInJobSearchUrl('SWE', 'India', '1d', { remoteOnly: true });
  if (!url.includes('f_WT=2')) throw new Error(url);
  if (!url.includes('India')) throw new Error(url);
  if (!url.includes('Software+Engineer') && !url.includes('Software%20Engineer')) throw new Error(url);
});

Deno.test('location search URL omits workplace filter', () => {
  const url = buildLinkedInJobSearchUrl('SWE', 'San Francisco, CA', '1d');
  if (url.includes('f_WT')) throw new Error(url);
});

Deno.test('Apify input includes workType only when remote', () => {
  const remote = buildApifyJobSearchInput('SWE', 'India', '1d', 5, { remoteOnly: true });
  if (remote.workType !== '2' || !remote.remoteOnly) throw new Error(JSON.stringify(remote));
  if (!remote.linkedinUrl.includes('f_WT=2')) throw new Error(remote.linkedinUrl);
  const local = buildApifyJobSearchInput('SWE', 'San Francisco, CA', '1d', 5);
  if (local.workType) throw new Error(JSON.stringify(local));
  if (local.remoteOnly) throw new Error(JSON.stringify(local));
});
