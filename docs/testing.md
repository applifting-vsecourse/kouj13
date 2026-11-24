# Test commands and CI

The existing `verify` job checks formatting, lint, types, unit tests and builds.
Three independent jobs accompany it:

- `test-integration`: `pnpm backend test:int` builds and starts a separate Nest
  process, then uses Supertest with real authentication and PostgreSQL. Files use
  `*.int-spec.ts`; tables are cleaned between tests. Prisma migrations create the
  schema. Local runs create `quacker_test` in the Docker Postgres container
  `backend-db-1`, never clean the development database, and use port 4051.
  `TEST_DATABASE_CONTAINER` overrides that container name. For another server,
  set `TEST_DATABASE_URL`; its database must still be named `quacker_test` and
  must already exist. CI provides its own Postgres service.
- `test-e2e`: `pnpm frontend e2e` runs the tests in `apps/frontend/e2e` and the
  existing root `e2e` directory. Locally, start the app first. CI supplies a fresh
  Postgres service, applies migrations, seeds test accounts, builds the backend,
  installs Chromium, and starts both app servers through Playwright's `webServer`.
  Playwright uses assertions and server readiness checks, with zero retries.
- `test-changes`: compares the PR head with its base commit using the full Git
  history. New tests and added assertions pass. Any removed lines in a test fail
  the job and print the affected filenames; renames cannot hide deletions.
  This is an advisory job: keep it out of required branch checks. It has no
  dependency on other jobs or deployment.

Integration runs share the test database; do not run two simultaneously or point
a development app at it. Email delivery is disabled in the integration process.

To check the advisory gate, change a passing test's name in its own commit and
push. Verify that only `test-changes` fails, then revert that commit. Since the
gate compares the complete PR against its base, the revert restores a green gate.
