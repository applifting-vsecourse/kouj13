# Architecture Decision Records

One line per decision. Open only the ADRs relevant to your change. ADRs are never rewritten: a new ADR supersedes an old one.

| #                                           | Title                                                 | Status   | Summary                                                                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-delete-quacks-as-tombstones.md) | Delete quacks with replies as content-free tombstones | Accepted | A quack with replies becomes a tombstone with its text, mood and poll erased, a quack without replies is hard-deleted, and `parentId` is `ON DELETE RESTRICT`.         |
| [0002](0002-likes.md)                       | Store one row per user and quack; derive like counts  | Accepted | A Like table enforces uniqueness with a composite primary key; counts and viewer state come from rows, and deletion removes target likes while preserving reply likes. |
