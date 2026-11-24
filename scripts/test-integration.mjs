import { execFileSync, spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { prepareTestDatabase, testEnvironment } from './test-database.mjs';

const env = testEnvironment();
prepareTestDatabase(env);
execFileSync('pnpm', ['backend', 'build'], { env, stdio: 'inherit' });
// A separate process exercises the production Nest bootstrap, including real auth.
const server = spawn(process.execPath, ['apps/backend/dist/main.js'], {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (data) => {
  logs += data;
});
server.stderr.on('data', (data) => {
  logs += data;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error('Test backend exited');
    try {
      const response = await fetch(`${env.BACKEND_URL}/api/quacks`);
      if (response.status === 401) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the HTTP listener. */
    }
    await setTimeout(250);
  }
  if (!ready) throw new Error('Test backend did not become ready');
  const result = spawn(
    'pnpm',
    [
      '--dir',
      'apps/backend',
      'exec',
      'jest',
      '--config',
      'test/jest-integration.json',
      '--runInBand',
      ...process.argv.slice(2),
    ],
    { env: { ...env, TEST_API_URL: env.BACKEND_URL }, stdio: 'inherit' },
  );
  process.exitCode = await new Promise((resolve) => result.on('exit', resolve));
} catch (error) {
  console.error(logs, error);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
}
