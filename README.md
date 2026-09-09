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
- hold-to-remove perimeter tracing for unpinned notes;
- 20-action, 10-minute local budget;
- pin, unpin, and removal rules;
- persistence and cross-tab updates through browser storage.
- developer controls for note size, tilt, and restoring the seeded board.

The gateway interface under `src/board/` is the seam for replacing local storage with the Supabase RPC/realtime implementation. Until that phase is connected, separate browsers and devices do not share state.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed by Vite. The prototype deliberately stores its current board in local browser storage. Use the `DEV` panel to restore the seed board or change the note-size/tilt profile.

## Board scaling

Board positions use normalized coordinates. Browser zoom and viewport changes scale the corkboard, notes, drawings, and pins together, preserving their spatial relationships. On narrow screens the board keeps its working dimensions and scrolls instead of compressing notes independently. The developer note-size setting is an intentional geometry change; applying it after refresh opens a separately seeded local board so its pins match the selected note size.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Supabase configuration

Copy `.env.example` to `.env.local` and add the project URL and anonymous key when the Supabase gateway is introduced. Never put a service-role key in a frontend environment file.
