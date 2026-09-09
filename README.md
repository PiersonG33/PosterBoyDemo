# Poster Boy demo

Poster Boy is a shared corkboard where visitors spend a limited supply of actions to create, pin, unpin, and remove sticky notes.

## Current milestone

This first implementation covers the static and local-interaction phases of the [demo plan](./posterboy-demo-plan.md):

- responsive corkboard and sticky-note visual system;
- seeded text and drawing notes;
- cursor-attached note placement with exact normalized board coordinates;
- in-board zoomed editing that keeps neighboring notes visible;
- text/drawing and sticky-color controls after placement;
- text composer with a 500-character limit;
- pointer-event drawing editor with pen sizes, color, undo, and clear;
- validated stroke JSON rendered into application-generated SVG previews;
- board-positioned pins that can secure overlapping notes, with collision checks and hold-to-pull progress;
- hold-to-remove perimeter tracing with a standard exit and optional curved peel-away effect;
- 20-action, 10-minute per-visitor budget;
- pin, unpin, and removal rules;
- a Supabase shared-board gateway with live cross-device updates;
- a browser-storage fallback when Supabase is not configured;
- developer controls for note size, tilt, removal animation, and restoring the seeded board.

The production setup uses GitHub Pages plus Supabase. Follow the exact [investor demo deployment guide](./docs/DEPLOYMENT.md) to create the backend and connect the deployed build.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed by Vite. Without `.env.local`, the prototype stores its board in local browser storage. Use the `DEV` panel to restore the seed board or change the note-size/tilt profile.

To exercise the shared board locally, copy `.env.example` to `.env.local` and enter a configured Supabase project's URL and publishable key. Shared-board and production builds hide the developer panel and lock the common board geometry at the 60% note-size profile.

## Board scaling

Board positions use normalized coordinates. Browser zoom and viewport changes scale the corkboard, notes, drawings, and pins together, preserving their spatial relationships. On narrow screens the board keeps its working dimensions and scrolls instead of compressing notes independently. The developer note-size setting is an intentional geometry change; applying it after refresh opens a separately seeded local board so its pins match the selected note size.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Deploy

The Pages workflow runs lint, tests, and the production build before publishing `dist`. Database setup, GitHub variables, reset instructions, and the demo-day checklist are in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).
