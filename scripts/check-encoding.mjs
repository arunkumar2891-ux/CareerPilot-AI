// Byte-level encoding audit. Run with: node scripts/check-encoding.mjs <files...>
// Reports mojibake (UTF-8 bytes that were decoded as Latin-1 then re-encoded)
// and the correct smart characters, without going through any shell encoding.
import { readFileSync } from 'node:fs';

const MOJIBAKE = [
  // what it looks like now      -> what it should be
  ['\u00e2\u0080\u0094', '\u2014', 'em dash'],
  ['\u00e2\u0080\u0093', '\u2013', 'en dash'],
  ['\u00e2\u0080\u00a6', '\u2026', 'ellipsis'],
  ['\u00e2\u0080\u0099', '\u2019', 'right quote'],
  ['\u00e2\u0080\u009c', '\u201c', 'left dquote'],
  ['\u00e2\u0080\u009d', '\u201d', 'right dquote'],
  ['\u00c2\u00b7', '\u00b7', 'middot'],
];

for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, 'utf8');
  const counts = [];
  for (const [bad, good, name] of MOJIBAKE) {
    const n = text.split(bad).length - 1;
    if (n) counts.push(`${name}:${n}`);
  }
  // Double-encoded (my PowerShell damage) shows up as a longer chain.
  const doubled = text.split('\u00c3\u0083').length - 1;
  const correct = [...'\u2014\u2013\u2026\u2019\u201c\u201d\u00b7']
    .map((c) => text.split(c).length - 1)
    .reduce((a, b) => a + b, 0);

  console.log(
    `${file.padEnd(46)} mojibake[${counts.join(' ') || 'none'}]` +
      ` doubled:${doubled} correct-smart-chars:${correct}`,
  );
}
