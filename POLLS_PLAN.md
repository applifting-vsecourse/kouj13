# Plan: single-choice polls in posts

Ship a small poll feature inside the existing Quacker feed. The database owns vote uniqueness and counts; the interface gives immediate feedback and clearly distinguishes a pending vote from a confirmed one.

## 1. Story and settled scope

> As a signed-in user, I can post a question with a few fixed answers so other users can choose one, change their choice, and see accurate totals without counting replies.

Decisions for the first release:

- A poll is an optional attachment to a new post. The post text is the question.
- Questions contain **1–280 characters** after trimming.
- Polls contain **2–6 answers**, each **1–80 characters** after trimming. Reject duplicate answers using case-insensitive comparison.
- Answers keep their creation order.
- Each signed-in account can select **exactly one answer per poll**, including the author.
- Selecting another answer replaces the previous vote. Selecting the same answer again changes nothing.
- Counts and total voters are visible before and after voting. Individual voters’ identities are not exposed.
- Polls remain open indefinitely. Questions and answers cannot be edited after publication.
- No vote withdrawal, multiple-choice voting, closing dates, notifications, or voter lists in this release.
- Existing posts and Settings continue working.

**Freshness contract:** the voter sees an immediate local update marked as pending. Other users receive committed counts on their next automatic refresh: every **5 seconds while the page is visible**, plus on focus, reconnect, and reload. This is eventual freshness, not simultaneous updates across browsers.

**Trial:** one week after release, report how many polls exist and how many received votes, and collect feedback in Seminars. Use database aggregates; no new analytics system.

## 2. Tables and relationships

Keep the existing `user` and `quack` tables. Add:

| Table / model                | Fields                                                   | Relationships and constraints                                                                                                                     |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `poll` / `Poll`              | `id`, `quackId`, `createdAt`                             | `quackId` is unique and references `quack.id`: a post has zero or one poll. Its author is the existing post author.                               |
| `poll_option` / `PollOption` | `id`, `pollId`, `label`, `position`                      | `pollId` references `poll.id`. Unique `(pollId, position)` preserves answer order. Unique `(id, pollId)` supports the composite vote foreign key. |
| `poll_vote` / `PollVote`     | `pollId`, `userId`, `optionId`, `createdAt`, `updatedAt` | Composite primary key `(pollId, userId)`. Foreign keys to `poll`, `user`, and composite `(optionId, pollId)` → `poll_option(id, pollId)`.         |

```text
user ──< quack ──0..1 poll ──< poll_option
user ──< poll_vote >── poll
              └─────> poll_option, within that same poll
```

**The database enforces one vote per account per poll** through the composite primary key. The composite foreign key prevents choosing an answer belonging to another poll.

Use cascading deletion for owned poll records and votes if their parent post or user is deleted. Add an index on `(pollId, optionId)` for counting votes.

Do not store mutable count columns. Derive every count from persisted vote rows, including zero-vote answers.

## 3. Backend contract and correctness

Follow the existing module → controller → service → repository structure.

### Create and read

- Extend `POST /api/quacks` with optional `poll: { options: string[] }`.
- Create the post, poll, and answers in one transaction. Invalid poll input must not leave a partial post.
- Extend `GET /api/quacks` with `poll: null` or:

  ```text
  id
  options: [{ id, label, position, voteCount }]
  totalVotes
  myOptionId: string | null
  ```

- Obtain the author and voter from the authenticated session, never from request-supplied user IDs.
- Read counts, total voters, and the current user’s selection from one consistent database snapshot. Use a repeatable-read transaction if assembling them through multiple queries.

### Vote and change vote

- Add `PUT /api/polls/:pollId/vote` with `{ optionId }`.
- Use a parameterized PostgreSQL `INSERT … ON CONFLICT (pollId, userId) DO UPDATE` in the repository.
- This handles first votes, changed votes, repeated requests, and concurrent requests without a read-then-insert race.
- Across tabs, the last database-serialized write wins; subsequent refreshes reveal that persisted choice.
- Return the authoritative poll state after saving.
- Return `401` when signed out, `404` for a missing poll, and `400` for malformed input or an answer outside the poll.
- Document the new payloads and errors in Swagger; validate frontend responses with Zod.

## 4. Frontend behavior

### Creation

Add an “Add poll” control to the existing post composer:

- Start with two labeled answer inputs.
- Allow adding answers up to six and removing answers down to two.
- Allow removing the poll attachment before submitting.
- Show client validation under the relevant field; independently validate on the server.
- Preserve all entered values on failure.
- Disable submission while saving and show pending feedback.
- Reset the composer only after successful creation.

Use the shared UI kit and follow `DESIGN.md`: visible labels, semantic colors, no nested cards or input shadows.

### Voting

Render labeled, keyboard-accessible single-choice controls inside the post, alongside each answer’s count and the total voters.

On selection:

1. Immediately show the selected answer and adjusted counts with “Saving vote…”.
2. Disable that poll’s voting controls until the request settles.
3. On success, replace local state with the authoritative response and invalidate the feed query.
4. On failure, remove the optimistic adjustment, show a visible error with Retry, and refetch persisted state.

Keep the optimistic adjustment scoped to that poll rather than restoring an entire feed snapshot, which could overwrite unrelated updates.

Treat a timeout or lost response as **“Couldn’t confirm your vote”**: the server may already have saved it. Refetch to reconcile; retrying the same selection is safe. Do not silently queue offline votes.

Show loading, empty, and error states. If background refresh fails, keep existing results but label them as potentially outdated and offer Retry.

## 5. Build order

| Order | Work                                                                                                 | Exit evidence                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **1** | Establish the current baseline and inspect the existing Settings implementation.                     | `pnpm check-all` passes, or existing failures are identified and resolved before release.             |
| **2** | Add schema and migration, transactional creation, atomic voting, and consistent count reads.         | Real PostgreSQL tests prove uniqueness, cross-poll protection, concurrent voting, and correct totals. |
| **3** | Add API response schemas and the poll creation form.                                                 | Validation, pending state, retained input on failure, and normal post creation pass component tests.  |
| **4** | Add vote controls, optimistic feedback, error reconciliation, and automatic refresh.                 | Component tests prove first vote, changed vote, failure handling, and refresh behavior.               |
| **5** | Review Settings and polls together, complete checks, and prepare the release.                        | No unresolved review findings; full checks pass.                                                      |
| **6** | Merge into `main`, deploy, run the two-account production acceptance scenario, and post in Seminars. | Release evidence recorded below.                                                                      |

## 6. Verification and completion gates

The implementing agent owns automated verification and records the results. The release operator owns deployment, production acceptance, and the Seminars announcement.

### Database/API evidence

Use an isolated real PostgreSQL test database to prove:

- Concurrent first votes by one account leave exactly one vote row.
- Changing a vote decreases the old answer by one and increases the new answer by one; total voters remains unchanged.
- Repeating the same selection leaves counts unchanged.
- Different accounts’ votes both count.
- Direct duplicate votes and cross-poll option references are rejected by database constraints.
- Invalid poll creation leaves no partial post.
- Signed-out requests cannot create or vote.

### Forms and interaction evidence

Test poll and Settings forms for valid and invalid submission, server errors, pending controls, and success behavior. Test immediate vote feedback, failed-request reconciliation, and refreshed authoritative counts.

Run **`pnpm check-all`** after implementation and again only if relevant code changes invalidate that evidence. Complete a focused accessibility and `DESIGN.md` review; resolve every finding before release.

### Production acceptance

Use two actual production accounts, A and B:

1. A creates “Where should we go for lunch?” with three answers.
2. B votes for the first answer.
3. A reloads and sees one vote for that answer, total one.
4. B switches to the second answer.
5. Both accounts see counts `0, 1, 0`, total one; A’s visible page updates on a successful automatic refresh.
6. Reload both accounts: B’s choice persists, and A has not acquired B’s selection.
7. Verify Settings changes survive a reload.

Attach the deployed URL, release commit, check results, and acceptance results to the release record. Production access and access to Seminars are execution prerequisites.

## 7. Review, learning, and release

Every changed file must have an explainable purpose: persistence, API behavior, UI behavior, verification, or documentation. Review the migration, constraints, concurrency behavior, and failure states explicitly.

Add this rule to `CLAUDE.md`:

> Per-user uniqueness must be enforced by a database constraint. Optimistic UI must distinguish pending state from confirmed state, reconcile failed or uncertain writes, and refresh authoritative server data.

Settings code is already present on the current `main`; verify its completeness and include any required fixes in the release. Merge polls and remaining Settings fixes into `main`, deploy through the existing production flow, and confirm migrations succeeded.

Finally, post in **Seminars**: the live URL, a short create/vote/change-vote walkthrough, verification results, and the request to try polls during the one-week trial.

**The plan has no remaining product or architecture decisions. Polls are done only when the checks, production scenario, learning rule, live deployment, and Seminars post are complete.**
