# 0001 · Delete quacks with replies as content-free tombstones

Status: Accepted · 2026-11-10

## Context

Replies are being added: a reply is a `Quack` with a nullable `parentId` pointing to its parent (see [story.md](../../story.md)). Until now, deleting a quack (week 5, author or admin) was a hard `DELETE`, and its poll, options and votes were removed with it by cascade.

The product owner gave two rules that pull in different directions:

- **Replies belong to the people who wrote them.** If someone deletes a quack that already has replies, the replies must not disappear.
- **When someone deletes their quack, its content has to really disappear from the app.** It has to be gone, not merely hidden.

A plain hard delete breaks the first rule, and a classic soft delete (`deletedAt` while keeping the row) breaks the second. The decision applies to every delete path in the app: author delete, admin moderation and any future account deletion.

## Decision

Deleting a quack that has replies turns it into a **tombstone**:

- The row stays so its replies still have a parent, and `deletedAt` is set.
- `text` is overwritten with `''` and `mood` is set to `NULL`.
- Its poll, options and votes are deleted.
- The API returns it anonymously (`deleted: true`, no text, author or `userId`).

Deleting a quack **without** replies stays a hard delete. The database backs this up with `parentId … ON DELETE RESTRICT`: it refuses to hard-delete any quack that still has replies.

## Options considered

- **Soft delete that keeps the text** (`deletedAt`, hide in queries): rejected. The content stays in the database, so it doesn't "really disappear". Any query, export or new feature that forgets the `deletedAt` filter leaks it. It would also allow "undo" and moderator audits, but nobody asked for those.
- **Hard delete, replies become standalone** (`ON DELETE SET NULL`): rejected. It is the simplest option and keeps the week 5 code, but replies lose their context and show up as confusing loose quacks.
- **Hard delete with cascade** (`ON DELETE CASCADE`): rejected. Other people's replies would be destroyed, which directly breaks "replies belong to the people who wrote them".
- **Block deleting a quack that has replies**: rejected. It is trivial to build, but authors could no longer remove their own content, and the request requires that they can.
- **Tombstone every delete, even without replies**: rejected. It gives one code path, but the table fills with empty rows that every read has to filter forever. Every deleted reply would also leave a "This reply was deleted" placeholder. Rows we don't need shouldn't be kept.

## Consequences

- **Every read of quacks has to handle tombstones.**
  - The feed shows a tombstone only while it still has replies.
  - Response DTOs blank its content and author.
  - The frontend `Quack` type has `deleted: true` with `user: null` and `userId: null`.
  - Search (in the browser over the feed) never matches a tombstone, because it has no text or author.
- **Delete is no longer a single `DELETE`.** The repository decides between hard delete and tombstone inside one transaction. If a reply arrives between the check and the delete, the `RESTRICT` foreign key error is caught and the delete falls back to a tombstone. The frontend can't assume a deleted quack vanished: it refetches instead of removing it from the cache optimistically.
- **The admin delete from week 5 follows the same rule.** There is one deletion rule for the whole app.
- **Tombstones can't be restored.** The text is gone for good. Neither users nor admins can undo a delete, and there's no moderation audit trail of deleted text. Adding either later needs a new ADR and a separate store, not a change to this one.
- **Future account deletion can't rely on the `User → Quack` cascade alone.** `RESTRICT` blocks it for quacks that have replies, so those must be tombstoned first.
- **Tombstones whose replies were all deleted stay as empty rows.** They are hidden from the feed and not cleaned up. If they ever add up to a real cost, a cleanup job can remove them.
- **A deleted quack's ID and `createdAt` stay visible.** This metadata remains in the API, which is acceptable because it reveals nothing about the content or the author.
