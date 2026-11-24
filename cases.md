# Likes acceptance cases

Status: Product decisions settled. No open product questions.

People can show they like a quack without replying. Every live quack and reply
shows a like button and a numeric count, including zero. Each signed-in user can
like it once and take that like back. Users can like their own posts.

The same rules apply to regular users and admins. A liker list and live updates
from other users without a refresh are outside this feature.

## Rules — unit tests

### U1 — Like as the signed-in user

**Given** a signed-in user and a live quack they have not liked,
**when** they like it,
**then** the operation uses their session identity and returns the saved count
and their own liked state.

### U2 — Unlike as the signed-in user

**Given** a signed-in user who has liked a live quack,
**when** they unlike it,
**then** the operation removes only their like and returns the saved count and
their own unliked state.

### U3 — Own posts and replies have the same permissions

**Given** a live quack or reply, including one written by the current user,
**when** that user likes or unlikes it,
**then** the same operation is allowed without author or admin restrictions.

### U4 — Missing and deleted targets

**Given** a missing or deleted quack or reply,
**when** a signed-in user tries to like or unlike it,
**then** the operation reports not found instead of creating or removing a like.

### U5 — Viewer-specific reads

**Given** a signed-in user reading the feed or a thread,
**when** like information is requested,
**then** the read uses that user's identity, so the shared count and that user's
liked state can be returned for both quacks and replies.

## API behaviour — integration tests against PostgreSQL

API contract: `PUT /api/quacks/:id/like` adds a like;
`DELETE /api/quacks/:id/like` removes it. Both accept no body and return HTTP 200
with `{ likeCount, likedByMe }`. Requests with body fields are rejected with 400,
including attempts to supply another user's identity. Feed, reply-list and create
responses also include `likeCount` and `likedByMe`.

### A1 — Start at zero

**Given** a newly created quack or reply,
**when** its author creates it or a signed-in user reads it,
**then** its response has `likeCount: 0` and `likedByMe: false`.

### A2 — Add, repeat, remove, repeat, add again

**Given** a live quack with no likes,
**when** one user likes it twice, unlikes it twice, then likes it again,
**then** all requests succeed and the successive counts are 1, 1, 0, 0, 1;
the corresponding liked states are true, true, false, false, true. Counts never
become negative, and duplicate likes are never stored.

### A3 — Different users and persistence

**Given** Alice and Bob both like a quack,
**when** Alice unlikes it and both users read the feed again,
**then** the count is 1 for both, Alice sees `likedByMe: false`, Bob sees
`likedByMe: true`, and fresh reads preserve that state.

### A4 — Own-quack likes

**Given** a quack written by the current user,
**when** they like and then unlike it,
**then** both requests succeed with the same count and state rules as another
author's quack.

### A5 — Reply likes are independent

**Given** a parent quack and a reply,
**when** users like or unlike the reply, including their own reply,
**then** the reply's count changes independently of the parent's, and the reply
list returns the correct state for each viewer.

### A6 — Authentication

**Given** a signed-out visitor or an invalid session,
**when** they try either like endpoint, read the feed, or read replies,
**then** the response is 401 and stored likes do not change.

### A7 — Session owns the like

**Given** Alice is signed in and Bob has liked a quack,
**when** Alice supplies Bob's identity in a mutation body,
**then** the response is 400 and Bob's like is unchanged. A normal bodyless unlike
by Alice also leaves Bob's like unchanged.

### A8 — Missing and deleted quacks

**Given** a nonexistent ID, a hard-deleted quack or reply, or a tombstone,
**when** a signed-in user tries either like endpoint,
**then** the response is 404 and no likes are created.

### A9 — Concurrent requests and database uniqueness

**Given** a live quack,
**when** the same user sends concurrent like requests,
**then** they all succeed but only one like is stored. Concurrent repeated
unlikes leave zero likes. Concurrent likes from two distinct users count twice.
A direct duplicate insert is rejected by a database constraint.

### A10 — Deletion removes likes and preserves reply likes

**Given** liked quacks and replies,
**when** an author or admin deletes a quack without replies,
**then** its likes are removed with it.

**Given** a liked parent with a liked reply,
**when** an author or admin deletes the parent,
**then** the parent becomes a tombstone, its likes are removed, and the reply
keeps its own likes. The tombstone reports zero likes and an unliked state.

### A11 — Delete racing with like

**Given** a live quack,
**when** deletion races with a like request,
**then** the like either succeeds before deletion or returns 404 after deletion;
the final deleted quack has no likes, including when it remains as a tombstone.

## End-to-end flows — Playwright

### E1 — Button, count, own liked state and reload

**Given** a signed-in user sees an unliked quack with count zero,
**when** they activate its like button,
**then** the confirmed count becomes 1, the button indicates it is selected and
offers to unlike, and reloading preserves both values.

**When** they activate it again,
**then** the confirmed count becomes 0, the button becomes unselected and offers
to like, and reloading preserves both values. The control works by keyboard and
exposes its selected state accessibly.

### E2 — Replies and tombstones

**Given** a signed-in user opens a thread with a reply,
**when** they like that reply,
**then** its button and count update independently of the parent's and persist
after reload.

**When** the parent is deleted,
**then** the tombstone shows no like button or count, and the surviving reply
still shows its own button, count and liked state.

### E3 — Pending and failed writes

**Given** a like or unlike request is still in flight,
**when** the user sees its button,
**then** the button is disabled and indicates saving; the count and selected
state remain at the last confirmed values until the response arrives.

**Given** saving fails or the connection drops after a possible server write,
**when** the UI handles the failure,
**then** it shows an error, refreshes authoritative count and liked state, and
allows retry after reconciliation. If refreshing also fails, it shows an error
with a retry action rather than presenting an uncertain state as confirmed.
