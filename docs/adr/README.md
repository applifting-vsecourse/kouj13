# Architecture Decision Records

One line per decision. Open only the ADRs relevant to your change. ADRs are never rewritten: a new ADR supersedes an old one.

| #                                           | Title                                                 | Status   | Summary                                                                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-delete-quacks-as-tombstones.md) | Delete quacks with replies as content-free tombstones | Accepted | A quack with replies becomes a tombstone with its text, mood and poll erased, a quack without replies is hard-deleted, and `parentId` is `ON DELETE RESTRICT`. |
