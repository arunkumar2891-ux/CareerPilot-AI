#!/usr/bin/env node
/**
 * Bumps the app version one step (1.0 -> 1.1 -> 1.2 ... 1.999 -> 2.0).
 * Run `npm run version:bump` and commit before pushing a deployment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

const MAX_MINOR = 999;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseVersion(raw) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(raw ?? '').trim());
  if (!match) {
    throw new Error(`package.json version must be "major.minor.patch", got "${raw}"`);
  }
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function nextVersion({ major, minor }) {
  return minor >= MAX_MINOR ? { major: major + 1, minor: 0 } : { major, minor: minor + 1 };
}

const pkg = readJson(pkgPath);
const current = parseVersion(pkg.version);
const next = nextVersion(current);
const nextVersionString = `${next.major}.${next.minor}.0`;

pkg.version = nextVersionString;
writeJson(pkgPath, pkg);

// Keep the lockfile in sync so `npm ci` on the build host doesn't fail.
if (fs.existsSync(lockPath)) {
  const lock = readJson(lockPath);
  lock.version = nextVersionString;
  if (lock.packages?.['']) {
    lock.packages[''].version = nextVersionString;
  }
  writeJson(lockPath, lock);
}

const label = next.minor === 0 ? `v${next.major}` : `v${next.major}.${next.minor}`;
console.log(`Version bumped to ${nextVersionString} (displays as "beta ${label}")`);
