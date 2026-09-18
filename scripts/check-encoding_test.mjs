// Self-test for scripts/check-encoding.mjs.
//
//   node scripts/check-encoding_test.mjs
//
// Guards the exact regression that let 94 corrupted strings ship: the original
// checker only recognised the Latin-1 form of mojibake, so CP1252 corruption
// (the kind Windows PowerShell actually produces) passed as clean.
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'enc-'));
let failures = 0;

function run(file) {
  try {
    execFileSync(process.execPath, ['scripts/check-encoding.mjs', file], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return 0;
  } catch (err) {
    return err.status ?? 1;
  }
}

function check(name, contents, expectExit) {
  const file = join(dir, `${name}.tsx`);
  writeFileSync(file, contents, 'utf8');
  const exit = run(file);
  const ok = exit === expectExit;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name} (exit ${exit}, expected ${expectExit})`);
  unlinkSync(file);
}

// Build corrupted text the same way the real damage happened, so the test
// cannot drift from reality: encode UTF-8, then decode each byte as CP1252.
const CP1252 = {
  0x80: 0x20ac, 0x85: 0x2026, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x99: 0x2122, 0x92: 0x2019,
};
const mangle = (s) =>
  [...Buffer.from(s, 'utf8')].map((b) => String.fromCodePoint(CP1252[b] ?? b)).join('');

console.log('check-encoding self-test\n');

// Clean files must pass.
check('ascii-only', "const a = 'Scoring';\n", 0);
check('correct-utf8', "const a = 'Scoring\u2026'; const b = 'A \u00b7 B';\n", 0);

// Corrupted files must be caught. These are the exact characters that shipped.
check('cp1252-ellipsis', `const a = '${mangle('Scoring\u2026')}';\n`, 1);
check('cp1252-emdash', `const a = 'started ${mangle('\u2014')} check';\n`, 1);
check('cp1252-middot', `const a = 'Proglite ${mangle('\u00b7')} Chennai';\n`, 1);
check('cp1252-arrow', `const a = 'paste ${mangle('\u2192')} score';\n`, 1);
check('cp1252-bullet', `const a = '${mangle('\u2022')} item';\n`, 1);

// Double-encoded (the PowerShell round-trip applied twice) must also be caught.
check('double-encoded', `const a = '${mangle(mangle('\u2014'))}';\n`, 1);

// A stray C1 control character is the other symptom of a bad round-trip.
check('c1-control', "const a = 'x\u0085y';\n", 1);

console.log(
  failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
