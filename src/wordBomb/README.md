# Custom Word Bomb

Everything in this directory belongs only to the Custom Word Bomb side project. The matching HTML entry is `CustomWordBomb/index.html`, and the only shared configuration change is enclosed by `CUSTOM WORD BOMB — BEGIN/END` comments in `vite.config.ts`.

To remove the game without changing Poster Boy:

1. Delete `src/wordBomb/`.
2. Delete `CustomWordBomb/`.
3. Delete the marked Custom Word Bomb `build` block from `vite.config.ts`.
4. Delete the marked Custom Word Bomb section from the root `README.md`.

The game is local pass-and-play and has no server, account, database, or Poster Boy state dependency.

## Custom word-list format

Upload a UTF-8 text or CSV file smaller than 2 MB. Words can be separated by whitespace, punctuation, or CSV delimiters. Entries are normalized to lowercase ASCII letters, duplicates are removed, and entries shorter than three letters are ignored.

The prompt generator considers every consecutive 2- and 3-letter sequence, then discards any sequence that does not occur in at least three distinct words. A list that cannot produce at least one safe prompt is rejected.
