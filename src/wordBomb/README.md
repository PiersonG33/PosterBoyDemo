# Custom Word Bomb

Everything in this directory belongs only to the Custom Word Bomb side project. The matching HTML entry is `CustomWordBomb/index.html`, and the only shared configuration change is enclosed by `CUSTOM WORD BOMB — BEGIN/END` comments in `vite.config.ts`.

To remove the game without changing Poster Boy:

1. Delete `src/wordBomb/`.
2. Delete `CustomWordBomb/`.
3. Delete the marked Custom Word Bomb `build` block from `vite.config.ts`.
4. Delete the marked Custom Word Bomb section from the root `README.md`.
5. If the multiplayer migrations have not been applied, delete all `supabase/migrations/20260912*_word_bomb_*.sql` files. If they have been applied, add a forward migration that drops the `word_bomb_*` public functions/tables and private helpers marked in those files.

Local pass-and-play has no server dependency. Online mode reuses the repository's Supabase connection and anonymous authentication, but all of its database tables, functions, policies, and Realtime publication entries are named `word_bomb_*` and isolated in the marked multiplayer migration.

## Enable online multiplayer

Apply the committed Supabase migration before deploying the frontend:

```bash
npx supabase link
npx supabase db push --dry-run
npx supabase db push
```

The existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` variables are reused; no additional frontend secrets are needed. Anonymous sign-ins and Realtime must remain enabled. The host creates a lobby, chooses lives, turn timing, difficulty increase, and the minimum number of answers supporting every prompt, shares its six-character code or invite URL, and starts once 2–8 players have joined. People joining an active game spectate until the host returns the finished game to the lobby, when they are promoted for the next game.

For testing multiple players on one computer, use independent browser profiles or a normal and private window. Tabs in the same browser profile can share the same anonymous Supabase identity.

## Custom word-list format

Upload a UTF-8 text or CSV file smaller than 2 MB. Words can be separated by whitespace, punctuation, or CSV delimiters. Entries are normalized to lowercase ASCII letters, duplicates are removed, and entries shorter than three letters are ignored. Online lobbies accept at most 10,000 unique words.

The prompt generator considers every consecutive 2- and 3-letter sequence, then discards any sequence that does not meet the host's configured minimum (three distinct words by default). A list that cannot produce at least one safe prompt is rejected.
