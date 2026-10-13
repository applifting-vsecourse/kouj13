# Polls release record

## Implementation — 2026-10-13

Single-choice polls are attached to new posts. Answers retain creation order and cannot be edited. The authenticated session owns authorship and votes. PostgreSQL enforces one vote per account and prevents cross-poll answer references. Counts come from vote rows, with a repeatable-read feed snapshot and a single aggregate vote-response snapshot.

The composer validates trimmed questions and 2–6 distinct answers, preserves failed submissions, and resets on success. Voting overlays only the affected poll, labels pending feedback, reconciles uncertain writes, and supports safe retry. Visible feeds refresh every five seconds and on focus/reconnect. Failed refreshes retain results and mark them potentially outdated.

Settings implementation was reviewed alongside polls. Added general server-error coverage and a PostgreSQL/API check that saved settings survive a fresh read without disrupting polls.

The learning rule is recorded in `CLAUDE.md`. `POLLS_PLAN.md` was formatted without changing scope.

## Automated evidence

- Baseline: backend 38 tests and frontend 32 tests passed; lint, type-checks, and builds passed. The supplied plan's formatting was the only baseline `pnpm check-all` failure.
- Final `pnpm check-all`: **passed** — backend 38 unit tests, frontend 43 component tests, both linters, frontend type-check, both production builds, and formatting checks.
- `pnpm backend test:postgres`: **19 tests passed** against a uniquely named, isolated PostgreSQL database; migrations replayed and the database was removed afterwards. Covers concurrent first votes, changed/repeated votes, two accounts, database constraints, invalid creation, transactional rollback, signed-out writes, session-owned votes, Settings persistence, and cascading deletion.
- Local `pnpm backend migrate`: migration `20261013010000_add_polls` applied successfully.
- CI now runs the isolated PostgreSQL suite in addition to the existing checks.

Run the database evidence locally with Docker available:

```sh
pnpm backend docker:up:wait
pnpm backend test:postgres
```

The suite defaults to the local `backend-db-1` container and `postgresql://quacker:quacker@localhost:5433/quacker`. Override `POLLS_TEST_CONTAINER` and `POLLS_TEST_ADMIN_URL` for another test server. It creates and drops only its uniquely named database.

## Focused design and accessibility review

- Polls use the shared Input, Button, Label, Form, Alert, and CLI-installed RadioGroup components.
- Visible answer labels, a named single-choice radio group, keyboard selection, count descriptions, pending status announcements, disabled pending controls, and visible errors with Retry are present.
- Semantic colors, divider/spacing grouping, no nested cards, no input/radio shadows, and secondary poll actions follow `DESIGN.md`.
- Feed loading is announced, empty states remain visible, and background failures retain authoritative cached results with a stale-data warning.
- Mutation success cancels older feed reads before applying the authoritative response; rollback never restores a whole-feed snapshot.

## Operator release gates — outstanding

The plan assigns deployment, production acceptance, and the Seminars announcement to the release operator. Production account credentials and Seminars access are not available in this coding session.

- Release commit: **not yet recorded**. Changes are in the local `main` working tree.
- Publish reviewed changes to `main` and observe `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`.
- Existing deployment builds/pushes backend and frontend images, then triggers Coolify via configured repository secrets. Confirm the production container applied the poll migration.
- Expected URL from the deployment workflow: <https://kouj13.vsepractical.applifting.dev>. **Poll deployment has not been verified.**
- Record the deployed commit, successful CI/deploy run URLs, and migration outcome here.
- Complete the two-account production scenario in `POLLS_PLAN.md` §6, including a five-second automatic update and Settings persistence after reload. Record each step's result.
- Post the announcement below in Seminars and record its link and publication date.
- Set the trial's start/end timestamps and report its aggregates one week after release.

## Seminars announcement draft

> Single-choice polls are live at [deployed URL]. Sign in, write a question in New quack, choose Add poll, enter 2–6 answers, and publish. Choose an answer to vote; choosing another changes your vote. Counts refresh automatically every five seconds while the feed is visible. “Saving vote…” marks an unconfirmed local update; Retry safely retries an uncertain write.
>
> Verification: [final check results], 19 isolated PostgreSQL/API checks, and [two-account production acceptance results]. Settings persistence was also checked.
>
> Please try creating, voting, and changing votes during our one-week trial and share feedback here. We will report how many trial polls were created and how many received votes on [trial end date].

## One-week trial report

Run this read-only aggregate on production after setting the trial's actual UTC bounds:

```sql
SELECT COUNT(*) AS polls_created,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM poll_vote v WHERE v."pollId" = p.id)
       ) AS polls_with_votes
FROM poll p
WHERE p."createdAt" >= TIMESTAMP 'TRIAL_START_UTC'
  AND p."createdAt" < TIMESTAMP 'TRIAL_END_UTC';
```

Record the counts and summarize Seminars feedback. No analytics system or voter identities are needed.
