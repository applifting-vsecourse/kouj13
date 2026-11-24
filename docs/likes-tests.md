# Likes test coverage and red baseline

The acceptance spec is [cases.md](../cases.md); storage is specified in
[ADR 0002](adr/0002-likes.md). Test names carry the case IDs.

| Cases  | Test file                                                       | Checks                                                                                                       |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| U1     | `apps/backend/src/modules/quack/services/likes.service.spec.ts` | Session-owned like and authoritative return value                                                            |
| U2     | Same unit file                                                  | Session-owned unlike and remaining count                                                                     |
| U3     | Same unit file                                                  | Own quacks, own replies, other replies; regular and admin users                                              |
| U4     | Same unit file                                                  | Missing/deleted targets map to not found for both mutations                                                  |
| U5     | Same unit file                                                  | Reads pass viewer identity for parent and reply IDs                                                          |
| A1     | `apps/backend/test/likes.int-spec.ts`                           | Zero counts on create, feed and reply reads                                                                  |
| A2, A4 | Same integration file                                           | Repeated own-quack likes/unlikes and re-liking; stored counts                                                |
| A3     | Same integration file                                           | Two users, independent viewer state and fresh persisted reads                                                |
| A5     | Same integration file                                           | Own/other reply likes and independent parent state                                                           |
| A6     | Same integration file                                           | Signed-out and invalid sessions get 401 on reads/writes                                                      |
| A7     | Same integration file                                           | Body-field rejection and another user's like remains unchanged                                               |
| A8     | Same integration file                                           | Missing, hard-deleted quacks/replies, and tombstones return 404                                              |
| A9     | Same integration file                                           | Concurrent likes/unlikes, distinct users, direct duplicate insertion                                         |
| A10    | Same integration file                                           | Author/admin hard deletion and tombstoning remove only target likes                                          |
| A11    | Same integration file                                           | Overlapping delete/like requests with and without surviving replies                                          |
| E1     | `apps/frontend/e2e/likes.spec.ts`                               | Real login, keyboard use, count, accessible selection and reload persistence                                 |
| E2     | Same browser file                                               | Independent reply likes, reload, parent deletion and hidden tombstone controls                               |
| E3     | Same browser file, three tests                                  | Controlled in-flight writes; rejected writes; committed writes with lost responses and failed reconciliation |

The red commit adds only new test files. Existing test files are unchanged.
Production scaffolding is limited to types, a registered controller with throwing
endpoints, and service/repository methods that throw `not implemented`. It adds
no likes migration, persistence, counting or frontend implementation.

Run the baseline with:

```sh
pnpm backend test --runInBand
pnpm backend test:int
pnpm frontend e2e
```

The first two commands compile and initialize normally. Unit assertions reject
the stubs' errors; API assertions reject missing response fields and HTTP 500
from the stubs. Browser assertions report missing like controls/counts after a
real login and successful post creation. No sleeps or test retries were added.
Unrelated existing tests and the authentication integration case remain green.

In the implementation session, locate `test: likes (red)` in Git history and
compare these three test files with that commit before finishing. Do not edit
them. If a test defect is discovered, explain the exact defect and proposed
correction in the PR and handle the correction as a separate reviewed commit.
