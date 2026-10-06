# Basic quack search

## User story

As a reader who remembers a word from a quack or who wrote it, I want to search by quack text or author name, so that I can find a post I saw previously.

## Acceptance criteria

1. **Search control:** The quack feed has a text field labelled “Search quacks”. Pressing Enter submits the search.
2. **Matching posts:** After submitting a non-empty search, the feed shows only quacks whose text or author’s displayed name contains the entered text. Posts matching either are included.
3. **Case and whitespace:** Searching for `hello`, `HELLO`, or `hello` produces the same results.
4. **No matches:** When no quacks match, the page displays “No quacks found” and keeps the search field available so the reader can try again.
5. **Clear search:** Clearing the field and pressing Enter restores the normal feed. Submitting only spaces also shows the normal feed.
6. **Empty feed:** If there are no quacks at all and no search is active, the page displays “No quacks yet”.

## Out of scope

- Advanced filters or separate author search controls.
- Autocomplete and search suggestions.
- Typo correction, fuzzy matching, or relevance ranking.
- Searching comments or other content.
- Search analytics or usage dashboards.

Search results use the normal feed order. This first version uses one search field and simple text matching.
