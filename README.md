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
- pointer-event drawing editor with undo and clear;
- validated stroke JSON rendered into application-generated SVG previews;
- 20-action, 10-minute local budget;
- pin, unpin, and removal rules;
- persistence and cross-tab updates through browser storage.

The gateway interface under `src/board/` is the seam for replacing local storage with the Supabase RPC/realtime implementation. Until that phase is connected, separate browsers and devices do not share state.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed by Vite. The prototype deliberately stores its current board in local browser storage; clear the `poster-boy-board-v1` key to restore the seed board.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Supabase configuration

Copy `.env.example` to `.env.local` and add the project URL and anonymous key when the Supabase gateway is introduced. Never put a service-role key in a frontend environment file.
