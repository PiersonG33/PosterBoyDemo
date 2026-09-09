# Investor demo deployment

Use GitHub Pages for the static Vite frontend and Supabase for the shared board, anonymous visitor identities, action budgets, database rules, and live updates. This keeps the demo small: there is no custom server to deploy or maintain.

Reference documentation: [Vite on GitHub Pages](https://vite.dev/guide/static-deploy#github-pages), [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous), [database migrations](https://supabase.com/docs/guides/deployment/database-migrations), and [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

The repository already contains:

- a GitHub Pages workflow at `.github/workflows/deploy.yml`;
- the Supabase browser client and a local-only fallback;
- the complete database migration at `supabase/migrations/20260909000000_initial_demo.sql`;
- row-level security and RPC-only mutations;
- a private SQL reset function that restores the seeded board;
- a `Live`, `Connecting`, `Offline`, or `Local demo` status in the header.

## 1. Create and configure Supabase

1. Create a Supabase project at <https://database.new>. Pick a region close to the people who will use the demo and save the database password somewhere secure.
2. In the Supabase Dashboard, go to **Authentication → Providers** (or **Authentication → Configuration**) and enable **Allow anonymous sign-ins**.
3. Apply the committed migration using one of the methods below.

### Recommended: apply it as a tracked migration

Install Docker Desktop first if you also want the full local Supabase stack. A remote migration push does not require the local stack to be running.

```bash
npx supabase login
npx supabase link
npx supabase db push --dry-run
npx supabase db push
```

Choose the new project when `link` prompts you. The final command creates the tables/functions, configures Realtime for notes and pins, and seeds the `investor-demo` board.

### Quick one-time setup: SQL Editor

Open the migration file, copy the whole file, paste it into **Supabase Dashboard → SQL Editor**, and run it once. This is convenient for the first demo, but do not later mix untracked SQL Editor schema changes with `supabase db push`; choose the migration workflow for subsequent database changes.

## 2. Add the frontend configuration to GitHub

In Supabase, open the project's **Connect** dialog or **Project Settings → API**. Copy the Project URL and the publishable key. The publishable key normally begins with `sb_publishable_`.

In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**, then add these repository variables:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | The Supabase Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The Supabase publishable key |
| `VITE_POSTER_BOY_BOARD` | `investor-demo` |

These are intentionally repository **variables**, not service-role credentials. A publishable key is designed to be shipped to browsers; access is constrained by the migration's RLS policies and database functions. Never add a Supabase `service_role` or secret key to a `VITE_` variable.

For local shared-board testing, copy `.env.example` to `.env.local`, enter the same values, and restart Vite:

```powershell
Copy-Item .env.example .env.local
npm run dev
```

When those values are absent, the app deliberately falls back to the browser-local demo and labels itself `Local demo`.

## 3. Enable GitHub Pages

1. In the GitHub repository, go to **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Push this commit to `main` or `master`, or open **Actions → Deploy Poster Boy to GitHub Pages → Run workflow**.
4. Wait for both the `build` and `deploy` jobs to pass. The deployment URL appears in the workflow and in **Settings → Pages**.

GitHub Pages from a private repository requires a GitHub plan that supports private-repository Pages. The resulting Pages site is public even though the source repository is private. That is usually ideal for a no-login investor demo, but treat its URL as shareable—not as an access control boundary.

If your GitHub plan does not support this, use Cloudflare Pages as the static host instead: connect the private repository, set the build command to `npm run build`, output directory to `dist`, and enter the same three environment variables. The Supabase setup remains unchanged.

## 4. Verify it before sharing

Open the deployed link in two independent browser contexts—two laptops is best; a normal and private window also works.

1. Confirm the header changes from `Connecting` to `Live`. `Local demo` means the GitHub variables were absent during the build.
2. Add a note in one browser. It should appear in the other within about a second.
3. Pin that note in the other browser, then confirm the first browser cannot pull the note until the pin is removed.
4. Confirm each browser has its own 20-action budget.
5. Refresh both pages and verify that the board is preserved.

If the board loads but changes do not propagate, inspect Supabase **Database → Publications** and confirm `notes` and `pins` belong to `supabase_realtime`. The migration normally does this automatically.

## Reset the board

There is intentionally no public reset button in the production build. In **Supabase Dashboard → SQL Editor**, run:

```sql
select private.reset_demo_board('investor-demo');
```

This deletes the current notes, pins, and action budgets for that board and restores all seeded demo content. Connected clients receive the reset through Realtime. Run it shortly before the meeting, then reload the deployed page and check for the `Live` label.

## Demo-day checklist

- Reset the board and test from two separate devices.
- Keep the Supabase Dashboard open in a private presenter tab for an emergency reset.
- Use a stable network and keep the GitHub Pages URL in a QR code plus plain text.
- Confirm the project is active well before the meeting, especially if it is on a plan that may pause inactive projects.
- Do not change the note-size debug setting for the hosted board. Production deliberately uses the fixed 60% geometry so every device agrees about note and pin hitboxes.
- Avoid circulating the URL broadly. Anonymous sign-ins create real Auth users; add Supabase CAPTCHA/Cloudflare Turnstile before any public launch or wide campaign.

## What the backend enforces

The browser never writes tables directly. Security-definer database functions serialize board changes and enforce:

- anonymous authenticated visitors only;
- 20 actions per visitor per 10-minute window;
- a maximum of 120 active notes;
- text and drawing size/format validation;
- pins must touch a live note and cannot overlap another pin;
- pinned notes cannot be removed;
- stale pin/note operations cannot spend an action;
- soft-deleted notes remain briefly available for the removal animation.

This is appropriate for a controlled investor demo. For a broad public beta, the next upgrades should be CAPTCHA, moderation/admin tooling, monitoring, automated anonymous-user cleanup, and Realtime Broadcast if concurrency grows far beyond a meeting-sized audience.
