# Poster Boy — Demo Implementation Plan

## 1. Objective

Build a public, shareable demonstration of **Poster Boy**, a social website represented as a shared corkboard covered in sticky notes.

Visitors can spend a limited supply of actions to change the board. An action can:

- create a text sticky note;
- create a hand-drawn sticky note;
- add a pin to an existing note;
- remove a pin from an existing note;
- remove an unpinned note from the board.

The important demonstration is not traditional social-media functionality such as profiles or follower graphs. It is the feeling that the corkboard is a **shared object that is continually being altered by everyone looking at it**.

The demo should therefore prioritize:

1. the visual corkboard;
2. text and drawing creation;
3. the action economy;
4. pinning/removal;
5. live synchronization between users;
6. easy public deployment.

Accounts, elaborate moderation, paper deformation, user profiles, WebP/AVIF preprocessing, and conventional social features can wait.

---

# 2. How this differs from a conventional social-media architecture

The generic architecture previously discussed still largely applies:

```text
Browser
   │
   ▼
React frontend
   │
   ▼
Backend / database API
   │
   ├── PostgreSQL
   ├── Authentication
   └── Realtime updates
```

However, Poster Boy changes what each layer needs to emphasize.

A conventional social application might center its backend around:

```text
users
posts
comments
likes
follows
feeds
notifications
```

Poster Boy initially needs something closer to:

```text
anonymous visitors
sticky notes
board positions
pin counts
action budgets
board mutations
realtime events
```

The backend can therefore be significantly smaller than a normal social network.

At the same time, **individual mutations need to be more carefully controlled**. For example:

> "Remove this note if and only if it currently has zero pins, and consume exactly one of my remaining actions."

must happen atomically.

The browser must not do this:

```text
1. Ask how many pins exist.
2. See zero.
3. Delete the note.
```

Another user could add a pin between steps 2 and 3.

Instead the server/database should perform the complete operation as one transaction:

```text
consume action
        +
lock/check note
        +
verify pin count = 0
        +
remove note
        =
one atomic operation
```

This shared-state behavior is the most important backend difference from the generic social-media implementation.

---

# 3. Recommended demo stack

Use:

| Component | Technology |
|---|---|
| Language | TypeScript |
| Frontend | React |
| Build tool | Vite |
| Styling | CSS / CSS modules |
| Drawing | HTML Canvas + Pointer Events |
| Frontend hosting | GitHub Pages |
| CI/deployment | GitHub Actions |
| Database | PostgreSQL via Supabase |
| Anonymous identity | Supabase Anonymous Auth |
| Realtime synchronization | Supabase Realtime |
| Source control | GitHub |
| Drawing source format | JSON stroke data |
| Drawing display | Generated SVG/blob preview |
| Paper deformation | Not in initial demo |

Vite explicitly supports deploying built applications to GitHub Pages through GitHub Actions.

GitHub therefore hosts both:

```text
github.com/<organization>/poster-boy
```

and:

```text
<organization>.github.io/poster-boy/
```

The only externally hosted part is the shared database/realtime service.

---

# 4. Proposed architecture

```text
                GitHub
          ┌────────┴────────┐
          │ source code     │
          │ GitHub Actions  │
          └────────┬────────┘
                   │ deploy
                   ▼
             GitHub Pages
                   │
                   │ HTTPS / WebSocket
                   ▼
                Supabase
        ┌──────────┼───────────┐
        │          │           │
        ▼          ▼           ▼
   PostgreSQL   Anonymous    Realtime
                sessions
```

GitHub Pages cannot execute backend languages/server processes, so the shared board cannot be implemented entirely on Pages.

A completely GitHub-only version could demonstrate the interface using local browser state, but two visitors would see different boards. That would remove one of Poster Boy's most important characteristics.

Use the shared Supabase-backed version for the public demonstration.

---

# 5. Anonymous visitors

Do not require users to create accounts for the demo.

When someone first opens Poster Boy:

```text
visitor opens site
       ↓
create anonymous Supabase session
       ↓
visitor gets an internal UUID
       ↓
initialize action budget
       ↓
show board
```

There does not need to be a visible login screen.

Supabase currently supports anonymous users that receive a normal authenticated session and user ID without requiring email, password, or OAuth. Those anonymous identities can later be linked to permanent login methods if accounts are added.

This gives Poster Boy an internal identity for:

- action quotas;
- rate limiting;
- abuse controls;
- future moderation;

without exposing an identity to other users.

For the demo, clearing browser storage may effectively give someone a new anonymous identity. That is acceptable for a showcase. Stronger anti-abuse measures can be added later.

---

# 6. Database model

Start with two main tables.

## `notes`

```text
id
created_at
author_id

content_type       "text" | "drawing"

text_content       nullable
drawing_data       nullable JSON

board_x
board_y
rotation

pin_count

removed_at         nullable
```

`board_x` and `board_y` should preferably be normalized coordinates rather than pixels:

```text
0.0 → 1.0
```

so different screen sizes can render approximately the same shared board layout.

`rotation` gives each sticky a slight permanent rotation, for example:

```text
-4° ... +4°
```

Do not regenerate rotation on each client or the board will look different to different people.

## `action_budgets`

```text
actor_id
window_started_at
actions_used
```

For a demo, use a fixed-window quota.

Example:

```text
20 actions / 10 minutes
```

The exact numbers should be treated as configuration rather than a permanent product decision.

The interface should display:

```text
Actions: 13 / 20
Next refill: 04:21
```

This immediately makes the central mechanic understandable.

---

# 7. Action implementation

Do not let the React client directly mutate `notes`.

Expose a small collection of database operations, conceptually:

```text
create_text_note(...)
create_drawing_note(...)
add_pin(note_id)
remove_pin(note_id)
remove_note(note_id)
get_action_status()
```

Every mutation must:

1. identify the current anonymous user;
2. lock/check the user's action budget;
3. reject the action if the limit has been reached;
4. perform the requested board change;
5. consume exactly one action;
6. return the updated result.

PostgreSQL functions are well suited to these small data-intensive operations and can be exposed through Supabase's API.

The protected tables should not simply allow arbitrary browser writes. Use tightly scoped grants/RLS and callable functions so a visitor cannot open the browser console and write:

```text
pin_count = 999999
actions_used = 0
```

Supabase recommends protecting exposed database objects with grants plus Row Level Security.

No Supabase service-role credential or other privileged secret should ever appear in the frontend repository.

---

# 8. Concurrency rules

Concurrency needs explicit testing because it is central to the concept.

Assume two users simultaneously do this:

```text
User A: remove note
User B: pin note
```

The database should serialize those operations.

Both operations should lock/check the affected note before modifying it.

The resulting behavior should therefore be one of:

```text
A removes note first
→ B's pin fails because the note no longer exists
```

or:

```text
B adds pin first
→ A's removal fails because pin_count > 0
```

It should never produce a state in which the note has technically been removed while a successful pin also exists on it.

For the demo, treat pins as global rather than owned objects:

```text
add pin       → pin_count + 1
remove pin    → pin_count - 1
remove note   → allowed only when pin_count = 0
```

This avoids needing a separate `pins` table.

If future product rules say that users own particular pins, replace the counter with actual pin records.

---

# 9. Realtime board synchronization

This is a demo requirement.

Opening Poster Boy in two browser windows should allow:

```text
Browser A creates sticky
        ↓
Browser B sees sticky appear

Browser B adds pin
        ↓
Browser A sees pin appear

Browser A removes pin
        ↓
Browser B sees pin disappear
```

without either page being refreshed.

Supabase Realtime can subscribe to Postgres inserts, updates, and deletes. Postgres Changes is the simplest implementation for this demo; Supabase currently recommends its Broadcast approach when greater scalability/security is required.

Recommended demo flow:

```text
page loads
   ↓
fetch current active notes
   ↓
render board
   ↓
open realtime subscription
   ↓
apply INSERT / UPDATE events as they arrive
```

Use `removed_at` rather than immediately hard-deleting rows.

That allows:

```text
UPDATE note
SET removed_at = now()
```

and lets clients animate the sticky being taken off the board before removing it from the DOM.

---

# 10. Corkboard UI

Implement the board as ordinary DOM elements.

Do not make the entire board a giant WebGL or `<canvas>` scene.

Recommended structure:

```text
<Corkboard>
    <StickyNote />
    <StickyNote />
    <StickyNote />
    ...
</Corkboard>
```

Each sticky can be absolutely positioned:

```text
position: absolute;
left: calc(board_x * boardWidth);
top: calc(board_y * boardHeight);
transform: rotate(...);
```

Use CSS for:

- cork texture/pattern;
- sticky-note colors;
- slight shadows;
- rotation;
- pin graphics;
- hover elevation;
- creation/removal animation.

A CSS/SVG corkboard aesthetic is sufficient for the initial demo.

Keep actual note content as normal browser elements where possible. This makes accessibility, performance, and interaction much easier than drawing the whole application into WebGL.

---

# 11. Text sticky notes

The text composer should be minimal:

```text
New note
┌──────────────────┐
│ Type something…  │
│                  │
└──────────────────┘

[Text] [Drawing]

Actions remaining: 12

       [Post]
```

Use a reasonable character limit, controlled by one application constant.

For example:

```text
MAX_TEXT_LENGTH = 500
```

The exact product limit can change later.

Validate it both client-side and server-side.

---

# 12. Drawing editor

Use an HTML `<canvas>` for drawing creation.

Capture strokes with Pointer Events so mouse, pen, and touch input use the same basic implementation.

The initial editor only needs:

```text
pen
undo
clear
post
```

Erasers, pressure sensitivity, colors, brushes, and advanced tools can be added later.

Store drawings in a format resembling:

```text
{
  "version": 1,
  "width": 320,
  "height": 320,
  "strokes": [
    {
      "width": 3,
      "points": [
        [0.12, 0.41],
        [0.13, 0.42],
        [0.15, 0.45]
      ]
    }
  ]
}
```

Coordinates should be normalized.

Do not store screenshots as the canonical drawing.

This preserves the useful property originally proposed:

> drawings can later be cloned, edited, extended, re-rendered at different resolutions, or converted into other formats.

Put a strict payload-size/point-count limit on drawing JSON so someone cannot publish a drawing containing millions of points.

---

# 13. Drawing rendering for the demo

Keep the proposed production idea, but simplify the demo implementation.

### Source of truth

Store:

```text
stroke JSON
```

### Demo display

When drawing data arrives:

```text
stroke JSON
    ↓
small deterministic SVG generated by our code
    ↓
SVG Blob / object URL
    ↓
<img>
```

The generated SVG is not user-supplied SVG markup. It is produced entirely by Poster Boy from validated coordinates.

This gives the feed ordinary `<img>` elements while avoiding:

- server-side image rendering;
- Supabase Storage;
- WebP generation;
- AVIF generation;
- CDN image pipelines.

Cache the generated object URL while the note is mounted and revoke it when the component is destroyed.

This is entirely sufficient for a board containing roughly a hundred small drawings.

---

# 14. How the original WebP/AVIF idea holds up

The original rendering strategy remains sound for a more mature version:

```text
stroke JSON
    │
    ├──────────────► canonical editable representation
    │
    ▼
pre-rendered WebP/AVIF
    │
    ▼
ordinary <img> feed
```

Then on hover:

```text
hovered image
     ↓
one shared WebGL renderer
     ↓
temporary deformation
```

The important part of the proposal is **sharing one deformation renderer instead of running a WebGL/filter instance for every sticky**.

PixiJS v8 currently includes a `DisplacementFilter`, so the suggested Pixi/WebGL approach remains technically reasonable for a later paper-warp effect.

Do not implement this for the first demo.

A convincing CSS shadow/rotation/hover effect will provide much more value per unit of implementation complexity.

---

# 15. Suggested DOM/rendering model

The board might contain approximately:

```text
50–150 sticky-note DOM elements
```

Each text note can simply contain text.

Each drawing note can contain one `<img>`.

Only animate elements currently changing.

Do not run continuous animation loops for every note.

A note should be essentially idle until:

- created;
- pinned;
- unpinned;
- removed;
- hovered.

This keeps the application lightweight even when the board is visually busy.

---

# 16. Optional finite board size

For the demo, consider imposing a maximum number of active notes, for example:

```text
120 active sticky notes
```

This is an implementation/demo constraint rather than necessarily a final product rule.

It has several useful effects:

- DOM size stays predictable;
- the physical-board metaphor becomes clearer;
- removing notes has visible value;
- the board does not gradually accumulate thousands of permanently pinned notes.

If the board is full, the UI can say:

```text
THE BOARD IS FULL

Remove something before adding another note.
```

This may actually reinforce the core interaction loop.

---

# 17. Action interface

Every sticky should expose contextual actions.

Example:

```text
       📌 3

┌─────────────────┐
│                 │
│    sticky       │
│    content      │
│                 │
└─────────────────┘

[+ Pin] [- Pin] [Remove]
```

The visual design should eventually replace ordinary buttons with interactions suited to the physical metaphor, but explicit buttons are useful during initial development.

Rules:

```text
+ Pin
available whenever note exists

- Pin
disabled when pin_count = 0

Remove
disabled when pin_count > 0
```

The server must enforce these rules independently of disabled UI controls.

---

# 18. Optimistic interactions

Creation/removal animations should feel immediate, but database results remain authoritative.

A reasonable implementation is:

```text
user clicks Pin
     ↓
temporarily animate pin interaction
     ↓
RPC succeeds
     ↓
commit UI state

or

RPC fails
     ↓
restore state / show brief error
```

The RPC response should also include the user's updated action balance so the client does not calculate quotas independently.

---

# 19. Suggested repository structure

```text
poster-boy/
│
├── src/
│   ├── components/
│   │   ├── Corkboard.tsx
│   │   ├── StickyNote.tsx
│   │   ├── TextNote.tsx
│   │   ├── DrawingNote.tsx
│   │   ├── DrawingEditor.tsx
│   │   ├── ActionMeter.tsx
│   │   └── NoteComposer.tsx
│   │
│   ├── drawing/
│   │   ├── types.ts
│   │   ├── captureStroke.ts
│   │   ├── simplifyStroke.ts
│   │   └── strokesToSvg.ts
│   │
│   ├── board/
│   │   ├── boardStore.ts
│   │   ├── realtime.ts
│   │   └── actions.ts
│   │
│   ├── lib/
│   │   └── supabase.ts
│   │
│   ├── App.tsx
│   └── main.tsx
│
├── public/
│   └── static SVG assets
│
├── supabase/
│   ├── migrations/
│   └── seed.sql
│
├── .github/
│   └── workflows/
│       └── deploy.yml
│
├── vite.config.ts
├── package.json
├── README.md
└── LICENSE
```

Keep database migrations in Git.

Someone cloning the repository should be able to understand both the frontend and database design from the repository itself.

---

# 20. Build sequence

## Phase A — static visual prototype

Build:

```text
corkboard
sticky-note component
random/sample notes
text rendering
drawing rendering from hard-coded stroke JSON
pin visuals
hover effects
```

No backend yet.

The goal is to establish the visual language before introducing realtime state.

## Phase B — drawing creation

Implement:

```text
drawing canvas
pointer stroke capture
undo
clear
JSON serialization
JSON → SVG preview
```

Both text and drawing notes should now work locally.

## Phase C — database

Create:

```text
notes
action_budgets
database action functions
RLS / grants
seed data
```

Connect the frontend.

## Phase D — anonymous identity and quotas

On first visit:

```text
anonymous sign-in
initialize budget
display remaining actions
```

All writes now pass through controlled action functions.

## Phase E — realtime

Subscribe to board changes.

Test with two browsers side-by-side.

This is the point where Poster Boy should begin to feel like the intended product rather than a static design exercise.

## Phase F — deployment

Configure Vite's GitHub Pages base path and GitHub Actions workflow.

Current Vite documentation recommends using GitHub Actions as the deployment source for a Vite-based GitHub Pages site.

A push to `main` should therefore run:

```text
npm ci
npm run test
npm run build
deploy dist/ to GitHub Pages
```

## Phase G — polish

Add:

```text
creation/removal animation
pin animation
action-meter animation
mobile layout
loading state
empty-board state
board-full state
error messages
seeded demonstration content
```

---

# 21. Demo scope

## Must have

The public demonstration should include:

- corkboard interface;
- shared persistent board;
- approximately 20–100 seeded sticky notes;
- text-note creation;
- drawing-note creation;
- stroke JSON storage;
- pin;
- unpin;
- remove unpinned note;
- action limit;
- visible action counter;
- anonymous session;
- realtime updates;
- GitHub repository;
- GitHub Pages deployment;
- desktop support;
- usable touch/mobile drawing.

## Explicitly postpone

Do not block the demo on:

- Google login;
- usernames;
- user profiles;
- followers;
- likes;
- comments;
- private messages;
- notifications;
- user image uploads;
- WebP/AVIF preprocessing;
- server-side drawing rendering;
- PixiJS;
- paper deformation;
- complex moderation interface;
- recommendation algorithms;
- Redis;
- queues;
- microservices;
- Docker;
- Kubernetes.

None of these are needed to prove Poster Boy's core interaction.

---

# 22. Public-demo safety guardrails

Because the deployed demo allows anonymous public writes, include a few guardrails immediately.

At minimum:

```text
server-enforced action quota
maximum text length
maximum drawing JSON size
maximum stroke count
maximum points per stroke/drawing
no arbitrary HTML
no arbitrary SVG input
database mutation permissions restricted
```

Anonymous visitors should only submit structured data generated by the application.

Supabase anonymous authentication also supports CAPTCHA tokens if automated abuse eventually makes that necessary.

For an early invitation-only demo, CAPTCHA does not need to be part of the first implementation.

---

# 23. Testing checklist

Before publishing the demo, verify:

### Basic operations

```text
text note can be created
drawing note can be created
drawing survives reload
pin increments correctly
unpin decrements correctly
unpinned note can be removed
pinned note cannot be removed
actions are consumed correctly
action limit stops further mutations
```

### Realtime

Open two unrelated browsers/devices and verify:

```text
create → appears remotely
pin → appears remotely
unpin → appears remotely
remove → disappears remotely
```

### Concurrency

Attempt simultaneous:

```text
pin + remove
unpin + remove
two pins
two removals
```

No invalid state should result.

### Input robustness

Test:

```text
very long text
empty text
empty drawing
very large drawing
rapid repeated clicks
mobile touch drawing
lost network connection
page reload during interaction
```

---

# 24. Definition of demo success

The demonstration is successful if someone can open a URL with no explanation, understand within a short period that:

> "This is a shared corkboard. I have a limited number of actions. I can contribute something, protect things with pins, and remove unprotected things."

They should then be able to open the same URL on another device and visibly see the consequences of their actions propagate to the shared board.

That interaction is Poster Boy's product thesis.

Everything else is secondary for the demo.

---

# 25. Recommended architecture after the demo

If the concept proceeds beyond a showcase, retain:

```text
React / TypeScript
PostgreSQL
stroke JSON
server-enforced action economy
realtime board events
```

Then add capabilities incrementally:

```text
Google / OAuth accounts
        ↓
persistent identities

moderation/reporting
        ↓
public deployment safeguards

drawing rasterization
        ↓
WebP / AVIF cached derivatives

object storage / CDN
        ↓
cheap delivery of drawing previews

shared PixiJS renderer
        ↓
hover paper deformation

better realtime architecture
        ↓
larger simultaneous audiences
```

Supabase currently describes simple Postgres Changes as the lower-setup realtime option and Broadcast as its recommended approach when scaling further.

The proposed "stroke JSON as canonical data + raster derivative for ordinary display + one active deformation renderer" model should therefore be considered the **production evolution** of the simplified demo approach, rather than replaced.

---

# Final recommended demo architecture

```text
                         GitHub
                            │
                      push to main
                            │
                            ▼
                     GitHub Actions
                            │
                            ▼
                     GitHub Pages
                            │
                  React + Vite + TS
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼
       board rendering                drawing editor
       ordinary DOM                   HTML canvas
             │                             │
             └──────────────┬──────────────┘
                            │
                            ▼
                       Supabase
               ┌────────────┼────────────┐
               ▼            ▼            ▼
          PostgreSQL    Anonymous      Realtime
                         Auth
               │
               ▼
        atomic board actions
        + action accounting
```

This is small enough for a demo team to build and understand, while exercising almost all of the architectural ideas that matter to the eventual Poster Boy product.