import { execFileSync } from 'node:child_process';

const base = process.argv[2];
if (!base)
  throw new Error('Usage: node scripts/check-test-changes.mjs <base-ref>');
// No rename detection: moving a test must not hide removal of its old contents.
const diff = execFileSync(
  'git',
  ['diff', '--no-renames', '--numstat', '-z', `${base}...HEAD`],
  { encoding: 'utf8' },
);
const changed = diff
  .split('\0')
  .filter(Boolean)
  .flatMap((record) => {
    const [, removed, ...parts] = record.split('\t');
    const file = parts.join('\t');
    const isTest =
      /\.(spec|int-spec|test)\.(ts|tsx)$/.test(file) ||
      file.startsWith('apps/frontend/e2e/') ||
      file.startsWith('e2e/');
    return isTest && removed !== '0' ? [file] : [];
  });
if (changed.length) {
  console.error(
    'Existing tests had lines removed or rewritten:\n' + changed.join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log('Test changes contain additions only.');
}
