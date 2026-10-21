# Admin moderation: delete any quack

As an admin, I want to delete any quack so that I can remove abusive posts when their author refuses to delete them.

## Decisions

- The existing `admin` role is the moderator role. Review with the seeded `admin@example.com` / `adminpassword` account.
- Reuse permanent deletion, its confirmation dialog, and the existing cascade deletion of poll data and votes.
- Preserve the existing 404 response for missing quacks and unauthorized regular users. Hide Delete on other authors' posts from regular users.

## Acceptance criteria

1. An authenticated author can still delete their own quack.
2. Another regular user cannot delete it, including through a direct API request; the quack remains intact.
3. An authenticated admin can delete any quack, including another admin's, using the same endpoint and confirmation flow.
4. The server derives permissions from the authenticated session. A supplied role or author cannot grant permission.
5. Delete is visible on all posts for admins and only on own posts for regular users. Cancel makes no change; confirmed deletion refreshes the feed.
6. Successful deletion returns 204; missing or forbidden deletion returns 404; signed-out deletion returns 401.
7. Swagger documents the author-or-admin permission.

## Out of scope

New roles, account management, editing others' posts, moderation queues, reporting, bans, and audit logs.

## Review checklist

- [x] Existing author deletion baseline: 18 backend tests and 48 frontend tests passed before changes.
- [x] Author: own Delete visible; cancellation preserves the quack; confirmed deletion removes it.
- [x] Other regular user: Delete hidden; direct DELETE rejected and post retained.
- [x] Admin: Delete visible on others' posts; confirmation removes the post.
- [x] Swagger: documented endpoint and authenticated DELETE checked.
- [x] E2E: three real accounts and real PostgreSQL; deliberately broken authorization makes the test fail; restore and pass.
- [x] Full repository checks pass (`pnpm check-all`: 46 backend tests, 49 frontend tests, lint, types, builds, formatting).

## Mutation evidence

Temporarily changed the service authorization to give both `user` and `admin` unrestricted deletion. `pnpm test:e2e` failed at the direct DELETE assertion: “A regular user cannot bypass the hidden Delete button” (expected 404, received 204). Restored the author-or-admin check before final verification.
