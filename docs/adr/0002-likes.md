# 0002 · Store one row per user and quack; derive like counts

Status: Accepted · 2026-11-24

## Context

[The acceptance cases](../../cases.md) require one reversible like per user on
every live quack, including replies and the user's own posts. Counts are shared;
the liked state belongs to the viewer. Repeated and concurrent requests must not
create duplicates or negative counts. Deleted quacks lose their likes, while
surviving replies keep theirs. ADR 0001 retains some deleted parents as tombstones.

The current Prisma schema represents replies as `Quack` rows and already uses a
composite primary key for per-user poll votes. We need database-enforced
uniqueness and reliable counts without maintaining two sources of truth.

## Decision

Add a `Like` model mapped to the `like` table, with `quackId`, `userId` and
`createdAt`. Use `@@id([quackId, userId])`, foreign keys to `Quack` and `User`
with `onDelete: Cascade`, and an index on `userId` for user deletion. The primary
key's leading `quackId` supports count and viewer-membership queries. Replies
use the same relation because they are quacks.

Count rows for `likeCount`; determine `likedByMe` by membership for the session
user. Do not store a counter on `Quack`. Read counts and membership in one query
or a consistent transaction, batching by quack IDs rather than fetching each
quack's likes separately. Never load every liker into the feed.

`PUT /api/quacks/:id/like` ensures the session user's row exists;
`DELETE /api/quacks/:id/like` ensures it does not. Both are idempotent and return
the saved `{ likeCount, likedByMe }`. A mutation must lock its live target in a
transaction, compatible with the existing quack deletion lock, so deleting and
liking cannot leave likes on a tombstone. Return 404 for missing/deleted targets.
The unique constraint remains the final protection against duplicates.

Hard deletion cascades to likes. Tombstoning explicitly deletes the target's
likes in the same transaction, without touching its replies' likes. A user row's
deletion removes that user's likes; handling their authored quacks remains
subject to ADR 0001.

The UI displays only confirmed state, disables the control while saving, and
refreshes authoritative data after writes or uncertain failures. Tombstones hide
like controls and counts. The API reports zero/false for tombstones.

## Options considered

1. **Like table with counts derived from rows — chosen by the product owner.**
   The database enforces ownership and uniqueness, counts cannot drift from the
   records, and unlike and viewer state have a natural representation. Counting
   costs more as the table grows, but grouped queries and indexes are sufficient
   for the current app. A cached counter can be introduced later with a backfill
   from these source records.
2. **Counter on Quack only — rejected.** Reads and increments are cheap, but a
   counter cannot identify which user liked a post, enforce per-user uniqueness,
   or authorize removing a particular like. Adding membership storage later
   cannot reconstruct historical identities from the counter.
3. **Like table plus a stored counter — rejected for now.** It supports fast
   count reads and membership checks, but every insert, unlike, user deletion,
   hard delete and tombstone must update both atomically. It adds contention and
   drift/reconciliation risks without demonstrated need. Adopting it later would
   require a backfill, transactional maintenance, and consistency checks.

## Consequences

- A migration adds a relation; existing posts naturally start at zero likes.
- All quack and reply response paths must include count and viewer state.
- Existing delete paths must remove likes when tombstoning, not just rely on
  foreign-key cascades.
- Concurrent writes and deletion need integration coverage against PostgreSQL.
- Counts are derived on read. If performance later requires denormalization, the
  rows remain the source from which a counter can be rebuilt.
- Removing source rows later would lose individual membership information;
  migrating to a counter alone would sacrifice the accepted feature rules.
