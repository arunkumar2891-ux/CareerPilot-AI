// Repair UTF-8 text that was decoded as Windows-1252 and re-encoded as UTF-8.
//
// Usage:
//   node scripts/fix-mojibake.mjs --check <files...>   report only (exit 1 if any found)
//   node scripts/fix-mojibake.mjs --write <files...>   repair in place
//
// The transformation is exactly invertible: map each mangled character back to
// the CP1252 byte it came from, then decode those bytes as UTF-8. We only touch
// the mangled forms of an explicit allow-list of characters, so arbitrary
// non-ASCII content is never rewritten speculatively.
import { readFileSync, writeFileSync } from 'node:fs';

const CP1252_HIGH = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};
const byteToChar = (b) => String.fromCodePoint(CP1252_HIGH[b] ?? b);

/** Simulate the corruption: UTF-8 bytes reinterpreted through CP1252. */
function mangle(str) {
  return [...Buffer.from(str, 'utf8')].map(byteToChar).join('');
}

// Characters this codebase legitimately uses in UI copy.
const CHARS = [
  '\u2014', '\u2013', '\u2026', '\u2019', '\u2018', '\u201c', '\u201d',
  '\u00b7', '\u2022', '\u2192', '\u2713', '\u2717', '\u25cb', '\u00a0',
  '\u20b9', '\u2605', '\u00d7', '\u2264', '\u2265',
];

// Longest-first so a double-mangled form is repaired before its single form,
// and multi-char sequences win over their prefixes.
const REPAIRS = [];
for (const ch of CHARS) {
  const once = mangle(ch);
  const twice = mangle(once);
  REPAIRS.push([twice, ch], [once, ch]);
}
REPAIRS.sort((a, b) => b[0].length - a[0].length);

const write = process.argv.includes('--write');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));

let totalFixed = 0;
let filesFixed = 0;

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const before = text;
  const perFile = [];

  for (const [bad, good] of REPAIRS) {
    if (!text.includes(bad)) continue;
    const n = text.split(bad).length - 1;
    text = text.split(bad).join(good);
    perFile.push(`${n}x ${JSON.stringify(bad)} -> ${JSON.stringify(good)}`);
    totalFixed += n;
  }

  if (text !== before) {
    filesFixed++;
    console.log(`${write ? 'FIXED' : 'WOULD FIX'}  ${file}`);
    for (const p of perFile) console.log(`    ${p}`);
    if (write) writeFileSync(file, text, 'utf8');
  }
}

console.log(
  `\n${totalFixed} occurrence(s) in ${filesFixed} file(s)` +
    (write ? ' repaired.' : ' would be repaired (dry run).'),
);
if (!write && totalFixed > 0) process.exit(1);
