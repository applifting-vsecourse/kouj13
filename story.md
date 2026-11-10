# Replies: reply to a quack and see the replies under it

As a user, I want to reply to a quack and see the replies under it, so that everyone can tell who is answering what instead of guessing from `@name …` posts.

Product owner's request:

> People discuss under quacks by posting a new quack that starts with '@name …', and nobody can tell what anyone is replying to. I want people to reply to a quack and see the replies under it. Replies belong to the people who wrote them: if an author deletes a quack that already has replies, the replies must not disappear with it. At the same time, when someone deletes their quack, its content has to really disappear from the app.

## What the user sees and does

- Every top-level quack in the feed shows a **"N replies"** toggle. Opening it shows the replies inline under the quack, oldest first, plus a reply box.
- The reply box works like the composer: text (same length limits) and an optional mood that starts on the user's default mood. It has no poll.
- Replies appear only under their parent, never as separate items in the main feed. The **Mine** tab and **search** cover top-level quacks only.
- Replies to replies are not possible. Replies have no reply toggle.
- Deleting works as before (author or admin, same confirmation dialog), with one difference:
  - **Quack without replies**: permanently deleted, as today.
  - **Quack with replies**: becomes a tombstone. The feed shows a muted **"This quack was deleted"** placeholder with no author, mood or poll, and its replies stay expandable underneath. Nobody can reply to it, and it has no Delete button.
- A tombstone whose replies have all been deleted no longer shows in the feed.

## Decisions

1. **Replies appear inline under the quack in the feed.**
   Rejected: a separate detail page `/quacks/:id`, which needs a new route and an extra click and isn't needed yet. The data model is the same, so we can add it later. Also rejected: replies as items in the main feed, which duplicates content and is the most UI work.
2. **A reply is a `Quack` with a nullable `parentId` (self-relation). Replies go one level deep, enforced in the service.**
   Rejected: a separate `Reply` table, which duplicates `Quack` so delete, mood and validation logic would have to be written twice, and merging it back later needs a data migration. Also rejected: unlimited nesting, with recursive rendering and queries and a cramped UI. Allowing replies to replies later only means removing a service check, with no migration.
3. **Deletion is hybrid: tombstone if the quack has replies, hard delete otherwise. A tombstone erases its content.** Deleting a quack that has replies sets `deletedAt`, overwrites `text` with `''`, sets `mood` to `null` and deletes its poll (options and votes cascade). A quack with no replies is hard-deleted as today. This applies to authors and admins alike. Recorded in [ADR 0001](docs/adr/0001-delete-quacks-as-tombstones.md).
   Rejected:
   - soft delete that keeps the text: the content wouldn't really disappear, and any query that forgets the filter leaks it
   - hard delete that orphans the replies (`SET NULL`): the replies lose their context
   - blocking deletes of quacks that have replies: authors couldn't remove their own content
   - tombstoning every delete: the table fills with empty rows, and every deleted reply would leave a "This reply was deleted" placeholder
4. **`parentId` uses `ON DELETE RESTRICT`.** The database refuses to hard-delete a quack that still has replies, so a bug or a `User` cascade can't silently remove other people's replies.
   Rejected: `SET NULL`, where a bug silently turns replies into top-level quacks, and `CASCADE`, which breaks the "replies belong to their authors" rule.
   Consequence: a future "delete account" feature has to tombstone that user's quacks that have replies before deleting the user.
5. **The reply count is computed when the feed is read, and replies load when a thread is opened.** `GET /api/quacks` returns `replyCount` via a `COUNT` on the indexed `parentId`. `GET /api/quacks/:id/replies` loads the thread when it's opened.
   Rejected: putting all replies inside the feed response, which bloats the payload, and a stored `replyCount` column, a copy that can drift and isn't needed at our scale.
6. **Replies have text and an optional mood, but no poll.** A reply that includes a poll gets 400.
   Rejected: text only, which needs special cases in the form and the default-mood logic, and a full quack with a poll, which hides polls inside collapsed threads and complicates tombstoning.
7. **Tombstones are anonymous in the API.** The response is `{ id, createdAt, deleted: true, text: '', mood: null, poll: null, user: null, userId: null, replyCount }`. The row keeps `userId` for the foreign key, but the API never exposes it.
   Rejected: showing "@author deleted this quack", which still reveals part of the deleted post.
8. **A tombstone is not cleaned up when its last reply is deleted.** The feed query already hides tombstones with no replies.
   Rejected: cascading cleanup, which adds extra code for no visible difference.

## Data model

Proposed change to `apps/backend/prisma/schema.prisma`:

```prisma
model Quack {
  id        String     @id @default(cuid())
  text      String     @db.Text
  mood      QuackMood?
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  createdAt DateTime   @default(now())
  updatedAt DateTime   @default(now()) @updatedAt
  poll      Poll?

  // Replies (one level deep, enforced in QuacksService)
  parentId  String?
  parent    Quack?     @relation("QuackReplies", fields: [parentId], references: [id], onDelete: Restrict)
  replies   Quack[]    @relation("QuackReplies")

  // Set when a quack with replies is deleted; text/mood are wiped, poll removed (ADR 0001)
  deletedAt DateTime?

  @@index([userId])
  @@index([parentId, createdAt])
  @@map("quack")
}
```

Migration `…_add_quack_replies`:

```sql
ALTER TABLE "quack" ADD COLUMN "parentId" TEXT, ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "quack_parentId_createdAt_idx" ON "quack"("parentId", "createdAt");
ALTER TABLE "quack" ADD CONSTRAINT "quack_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "quack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

### Review against the three questions

**1. Can everything the user sees be read with simple queries?** Yes:

| User sees                                                        | Query                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feed (top-level quacks, with tombstones that still have replies) | `quack.findMany({ where: { parentId: null, OR: [{ deletedAt: null }, { replies: { some: {} } }] }, include: { user, poll, _count: { select: { replies: true } } }, orderBy: { createdAt: 'desc' } })`                               |
| "N replies" on each quack                                        | `_count.replies` in the feed query (one grouped `COUNT` on the `parentId` index)                                                                                                                                                    |
| Replies under a quack, oldest first                              | `quack.findMany({ where: { parentId: id }, include: { user }, orderBy: { createdAt: 'asc' } })`                                                                                                                                     |
| Can I reply to this?                                             | `quack.findFirst({ where: { id, parentId: null, deletedAt: null } })`                                                                                                                                                               |
| Delete: hard or tombstone?                                       | `quack.deleteMany({ where: { id, userId?, deletedAt: null, replies: { none: {} } } })`, and if nothing was deleted but the quack exists, `quack.update({ data: { text: '', mood: null, deletedAt: now, poll: { delete: true } } })` |
| Search, Mine tab                                                 | Unchanged, run in the browser over the feed response. Tombstones have `text: ''` and `user: null`, so they never match.                                                                                                             |

**2. Is anything stored twice?** No. `replyCount` is computed when the feed is read, not stored. Author names are still read through the `User` relation. The tombstone's `userId` is not a copy: the foreign key needs it and the API never exposes it. If we reach millions of quacks, a stored counter could be added later as a separate ADR.

**3. What happens to related rows when a quack is deleted?**

- **No replies**: the row is hard-deleted, and its poll, options and votes cascade as today.
- **Has replies**: the row stays as a tombstone with text and mood wiped, and the poll, options and votes are deleted. The replies are untouched and still point to the tombstone.
- **The database guarantees it**: `parentId ON DELETE RESTRICT` blocks any hard delete of a quack that still has replies, including a `User → Quack` cascade.
- **Race condition**: if a reply is inserted between the "no replies?" check and the hard delete, the foreign key error is caught and the delete falls back to a tombstone. Everything runs in one transaction.
- **Deleting a tombstone again**: returns 404.

**4. Will the migration run on a production database that already has data?** Yes. It only adds two nullable columns, an index and a foreign key. No backfill is needed: every existing quack becomes a top-level, not-deleted quack (`parentId = NULL`, `deletedAt = NULL`), which is exactly what it is today. The foreign key is valid immediately because every value is `NULL`. Old `@name …` posts stay as they are and are not converted to replies.

## Where it lands in the code

**Backend, `apps/backend/src/modules/quack`**

- **`prisma/schema.prisma` and a new migration**: the schema and migration above.
- **`domain/quack.ts`**:
  - add `parentId`, `deletedAt` and `replyCount` to `Quack`
  - make `user` optional for tombstones
- **`controllers/dto/create-quack.dto.ts`**: add an optional `parentId`, rejected (400) together with `poll`.
- **`controllers/dto/quack.response.dto.ts`**:
  - add `deleted`, `replyCount` and `parentId`
  - make `user` and `userId` nullable
  - `fromDomain` blanks out tombstones
- **`controllers/quacks.controller.ts`**:
  - add `GET /api/quacks/:id/replies`
  - `POST /api/quacks` accepts `parentId`
  - update the Swagger docs for delete semantics
- **`services/quacks.service.ts`**:
  - reply validation: the parent exists, is top-level and not deleted, otherwise 404
  - no poll on replies (400)
  - the delete rule
- **`repositories/quack.repository.ts`**:
  - the feed filter and `_count`
  - `getReplies`
  - the hybrid `deleteQuack` in one transaction

**Frontend, `apps/frontend/src/features/quack`**

- **`api/quackSchemas` / `lib/quack-schemas.ts`**: add `deleted`, `replyCount` and `parentId`, with `user` and `userId` nullable.
- **New `api/getReplies.ts`, `hooks/useReplies.ts` and query keys**: `quackKeys.replies(id)`.
- **`useAddQuack`**: accepts `parentId` and invalidates the parent's replies and the feed (for the reply count).
- **`useDeleteQuack`**:
  - stop removing the quack from the cache optimistically
  - refetch instead, because a deleted quack may come back as a tombstone
- **`QuackItem`**:
  - tombstone rendering
  - the "N replies" toggle
  - an inline `ReplyList` and `ReplyForm`, reusing `QuackForm` pieces and following `DESIGN.md`
- **`QuackFeed`**: search handles `user: null`.
- **`DeleteQuack`**: dialog text changes to "This quack and its poll will be deleted. Replies from other people stay."

**Seed**: add at least one quack with replies, so the feed shows a thread in development and production.

## Acceptance criteria

1. A signed-in user can open a quack's replies in the feed and post a reply with text and an optional mood. The reply appears under the quack, oldest first, and the reply count goes up.
2. Replies don't appear as top-level items in the feed, the Mine tab or search.
3. The API rejects replying to a reply, to a tombstone or to a missing quack (404), and rejects a reply that includes a poll (400). The author always comes from the session.
4. Deleting a quack with no replies removes it permanently, along with its poll and votes, as before.
5. Deleting a quack with replies (as its author or an admin) turns it into "This quack was deleted". Its text, mood, poll and author appear nowhere: not in the feed, not in the replies view, not in search, and not in any API response. In the database its `text` is `''`, `mood` is `NULL` and its poll rows are gone.
6. All replies under a deleted quack stay visible and keep their authors.
7. A tombstone with no remaining replies doesn't appear in the feed. Deleting a tombstone again returns 404.
8. A database-level hard delete of a quack that has replies fails (`ON DELETE RESTRICT`).
9. The migration applies cleanly to a database with existing quacks, and they all stay top-level, not-deleted quacks.
10. Swagger documents the new reply endpoint, the `parentId` field and the delete behaviour.

## Out of scope

Replies to replies, a quack detail page, notifications, editing replies, restoring deleted quacks, a stored reply counter, converting old `@name …` posts into replies, and searching reply text.
