// Throwaway Deno.test shim so pure-logic suites can run under Node (Deno is not installed).
// Usage: node --experimental-strip-types scripts/run-deno-tests.mjs <test-file> [...]
const cases = [];
globalThis.Deno = {
  test: (name, fn) => {
    if (typeof name === 'object') cases.push({ name: name.name, fn: name.fn });
    else cases.push({ name, fn });
  },
  env: { get: (k) => process.env[k], set: (k, v) => { process.env[k] = v; }, toObject: () => ({ ...process.env }) },
};

const files = process.argv.slice(2);
for (const f of files) {
  await import(new URL(f, `file://${process.cwd()}/`).href);
}

let pass = 0;
const failures = [];
for (const c of cases) {
  try {
    await c.fn();
    pass++;
    console.log(`  ok   ${c.name}`);
  } catch (err) {
    failures.push({ name: c.name, err });
    console.log(`  FAIL ${c.name}\n       ${err?.message ?? err}`);
  }
}
console.log(`\n${pass} passed / ${failures.length} failed (${cases.length} total)`);
process.exit(failures.length ? 1 : 0);
