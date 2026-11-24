import { execFileSync } from 'node:child_process';

export function testEnvironment() {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://quacker:quacker@localhost:5433/quacker_test';
  const url = new URL(databaseUrl);
  if (url.pathname !== '/quacker_test') {
    throw new Error('Tests require a separate database named quacker_test');
  }
  return {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: 'isolated-test-secret-at-least-32-characters',
    SUPERADMIN_EMAIL: 'admin@example.com',
    SUPERADMIN_PASSWORD: 'adminpassword',
    BACKEND_URL: 'http://localhost:4051',
    FRONTEND_URL: 'http://localhost:3051',
    PORT: '4051',
    RESEND_API_KEY: '',
    SMTP_HOST: '',
    SMTP_USERNAME: '',
    SMTP_PASSWORD: '',
  };
}

export function prepareTestDatabase(env) {
  if (!process.env.CI && !process.env.TEST_DATABASE_URL) {
    const container = process.env.TEST_DATABASE_CONTAINER ?? 'backend-db-1';
    const args = ['exec', container, 'psql', '-U', 'quacker', '-d', 'postgres'];
    const exists = execFileSync(
      'docker',
      [
        ...args,
        '-tAc',
        "SELECT 1 FROM pg_database WHERE datname = 'quacker_test'",
      ],
      { encoding: 'utf8' },
    );
    if (exists.trim() !== '1') {
      execFileSync('docker', [...args, '-c', 'CREATE DATABASE quacker_test']);
    }
  }
  execFileSync('pnpm', ['backend', 'migrate'], { env, stdio: 'inherit' });
}
