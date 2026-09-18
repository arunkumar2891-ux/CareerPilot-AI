// Detect UTF-8 text that was decoded as a single-byte codepage and re-encoded
// ("mojibake"), at the byte level. Run after any scripted bulk edit.
//
//   npm run check:encoding          scan all source files
//   node scripts/check-encoding.mjs <files...>
//
// Exits non-zero if anything is found, so it can gate a commit.
//
// HISTORY / WHY THIS IS SUBTLE: the first version of this script only looked for
// the *Latin-1* rendering of mojibake (the U+00C3 family). Real corruption on
// Windows comes through CP1252, where byte 0x80 maps to U+20AC (euro sign)
// rather than U+0080 - so an em dash mangles to a 3-char sequence that contains
// no U+00C3 at all. That version reported 94 genuinely-corrupted occurrences
// across 12 files as clean, and the garbled text shipped. Always derive the
// expected mangled form by simulating the corruption (encode UTF-8, decode
// CP1252) instead of hand-writing the byte sequences.
//
// NOTE: this file is deliberately pure ASCII so that scanning the repo -
// including scripts/ - stays clean. Do not paste example mojibake in here.
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

/** Default scan set when no files are passed: all hand-written source. */
function defaultFiles() {
  return globSync(
    ['src/**/*.{ts,tsx,css}', 'supabase/functions/**/*.ts', 'index.html'],
    { exclude: (p) => p.includes('node_modules') },
  );
}

// CP1252 differs from Latin-1 only in 0x80–0x9F.
const CP1252_HIGH = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

/** Simulate the corruption: UTF-8 bytes reinterpreted through CP1252. */
function mangle(str) {
  return [...Buffer.from(str, 'utf8')]
    .map((b) => String.fromCodePoint(CP1252_HIGH[b] ?? b))
    .join('');
}

// Characters this codebase legitimately uses in UI copy and comments.
const CHARS = [
  ['\u2014', 'em dash'], ['\u2013', 'en dash'], ['\u2026', 'ellipsis'],
  ['\u2019', 'apostrophe'], ['\u2018', 'left quote'],
  ['\u201c', 'left dquote'], ['\u201d', 'right dquote'],
  ['\u00b7', 'middot'], ['\u2022', 'bullet'], ['\u2192', 'arrow'],
  ['\u2713', 'check'], ['\u2717', 'ballot X'], ['\u25cb', 'circle'],
  ['\u00a0', 'nbsp'], ['\u20b9', 'rupee'], ['\u00d7', 'times'],
];

// Longest first so a double-mangled form is attributed before its single form.
const PATTERNS = [];
for (const [ch, name] of CHARS) {
  const once = mangle(ch);
  PATTERNS.push([mangle(once), `${name} (DOUBLE-encoded)`], [once, name]);
}
PATTERNS.sort((a, b) => b[0].length - a[0].length);

let total = 0;
let dirty = 0;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = args.length ? args : defaultFiles();

for (const file of targets) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  // Attribute each occurrence once: consume longest matches first.
  let scratch = text;
  const found = [];
  for (const [bad, name] of PATTERNS) {
    if (!scratch.includes(bad)) continue;
    const n = scratch.split(bad).length - 1;
    scratch = scratch.split(bad).join('\u0000');
    found.push(`${name} x${n}`);
    total += n;
  }

  // A lone C1 control character is another symptom of a bad round-trip.
  const controls = (text.match(/[\u0080-\u009f]/g) || []).length;
  if (controls) found.push(`C1 control chars x${controls}`);

  if (found.length) {
    dirty++;
    console.log(`  ${file}`);
    console.log(`      ${found.join(', ')}`);
  }
}

if (total === 0 && dirty === 0) {
  console.log(`Encoding OK - no mojibake in ${targets.length} file(s).`);
} else {
  console.log(`\n${total} occurrence(s) across ${dirty} file(s).`);
  console.log('Repair with: node scripts/fix-mojibake.mjs --write <files...>');
  process.exit(1);
}
