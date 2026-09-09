You are building a production leaderboard that will be shown on a screen in
front of about 120 students during a live event, and shared as a public URL.
It must be reliable and it must look finished. Treat this as a real handover,
not a demo.

## Step 0: read before you write

Do not write any code yet. First read these files completely:

- `reference/current-Code.gs` (the existing Apps Script backend)
- `reference/current-Index.html` (the existing single-file leaderboard, currently rendered inside Apps Script)
- `reference/DEPLOY.md` (context on how it is deployed today and the pitfalls already found)

These are the source of truth for behaviour, visual design and copy. You are
porting them, not redesigning them. Never edit anything inside `reference/`.

## The change we are making

Today the page is served by Apps Script itself and calls the server with
`google.script.run`. We are splitting it into two independent pieces:

```
Google Sheet  ->  Apps Script Web App (JSON API)  ->  static site on Netlify  ->  students
```

- Apps Script keeps reading the sheet and becomes a pure JSON API. It serves no HTML any more.
- The frontend becomes a plain static site (`index.html`, `style.css`, `script.js`) that fetches that JSON.
- Netlify hosts the frontend. A custom domain gets pointed at it later.
- The sheet stays private. Only the API is public, and it exposes scores only.

## Target file tree

```
.
├── CLAUDE.md                  project context for future sessions
├── README.md                  setup, deploy and event-day runbook
├── netlify.toml               Netlify build config
├── apps-script/
│   ├── Code.gs                the JSON API
│   └── README.md              how to install and deploy the Apps Script half
├── public/                    this folder is what Netlify publishes
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   ├── config.js              everything the client owns: houses, colours, API URL
│   ├── mock.json              sample payload for offline development
│   └── assets/
│       ├── mesa-logo.svg
│       └── logos/
│           ├── vikings.png    (I will drop the real crests in, create placeholders)
│           ├── gladiators.png
│           ├── samurai.png
│           └── knights.png
└── reference/                 read only, never modify
```

## Hard constraints

- Vanilla HTML, CSS and JavaScript only. No React, no bundler, no npm install, no build step. Netlify must be able to publish `public/` as-is.
- ES5-compatible syntax in `script.js`. This runs on venue TVs and cheap laptops with old browsers. `var` and `function`, no arrow functions, no template literals, no optional chaining. `fetch` and `Promise` are acceptable.
- No external JS libraries. Google Fonts via the existing CSS import is fine.
- Zero secrets in the frontend. The Apps Script URL is public by design, nothing else goes in there.
- Do not change the visual design. Same palette, same typography, same layout, same animations, same copy tone.

## Known pitfall, do not rediscover it

Calling an Apps Script web app from a browser on another domain works only for
plain `GET` requests with no custom headers. The `/exec` URL 302-redirects to
`script.googleusercontent.com`, which is what actually sends the CORS header.
So:

- The API is `GET` only.
- Do not set `Content-Type`, `Authorization` or any custom header in the fetch.
- Do not use `mode: 'no-cors'`, it gives you an unreadable opaque response.
- Add a cache-busting query param on every request.
- Build in a JSONP fallback: if `doGet(e)` receives `?callback=name`, wrap the JSON in that callback and serve it as JavaScript. The frontend should fall back to injecting a script tag if `fetch` fails. This is the safety net for the day something blocks the normal request.

## Part 1: `apps-script/Code.gs`

Port the logic from `reference/current-Code.gs`, keeping every fix already in
it. Specifically keep:

- Real column index mapping for houses, so a blank or spacer column does not silently shift every score onto the wrong house.
- `toNumber_()` coercion, so a score typed into a text-formatted cell still counts toward totals.
- Rows labelled Total, Totals, Grand Total, Sum or Overall are skipped.
- Ranking sorted by total descending, ties broken alphabetically so cards do not reshuffle between polls.
- `CacheService` on the computed payload.
- The `validateSheet()`, `clearCaches()` and `setUpSheet()` helper functions.

Changes to make:

- Replace `doGet()` so it returns JSON through `ContentService`, not HTML. Delete `include()` and anything else HTML related.
- Drop the Drive crest loading entirely. Crests now live in the repo as PNGs and are owned by the frontend, so the API never sends image data. Keep house colours out of the API too.
- Support `?callback=` for JSONP as described above.
- Wrap everything in try/catch and return a structured error rather than throwing an Apps Script stack trace at the browser.

### API contract, do not deviate

Success:

```json
{
  "ok": true,
  "houseNames": ["Vikings", "Gladiators", "Samurai", "Knights"],
  "games": [
    { "name": "Tug of War", "scores": { "Vikings": 50, "Gladiators": 30, "Samurai": null, "Knights": 20 }, "maxPoints": 50 }
  ],
  "ranking": [ { "name": "Vikings", "total": 120, "rank": 1 } ],
  "gamesCompleted": 3,
  "totalGames": 8,
  "totalMaxPoints": 400,
  "generatedAt": "2026-09-09T10:00:00.000Z"
}
```

Failure:

```json
{ "ok": false, "error": "Human readable reason" }
```

A house cell that has not been scored yet is `null`, never `0` and never `""`.
That distinction drives the whole "game complete" logic downstream.

## Part 2: the frontend

Split `reference/current-Index.html` into `index.html`, `style.css` and
`script.js`. The CSS moves across unchanged apart from formatting. The
JavaScript loses `google.script.run` and gains a fetch layer.

### `public/config.js`

Every value a non-developer might want to change lives here and nowhere else,
with a comment on each:

```javascript
var CONFIG = {
  API_URL: '',                  // paste the Apps Script /exec URL here
  EVENT_TITLE: 'House Olympics',
  REFRESH_MS: 20000,
  CLOSE_RACE_GAP: 50,
  MILESTONE_STEP: 200,
  AUTO_CELEBRATIONS: false,
  USE_MOCK: false,              // true loads mock.json instead of the API
  HOUSES: [
    { name: 'Vikings',    color: '#F2BD0E', logo: 'assets/logos/vikings.png' },
    { name: 'Gladiators', color: '#40A261', logo: 'assets/logos/gladiators.png' },
    { name: 'Samurai',    color: '#1B3A6B', logo: 'assets/logos/samurai.png' },
    { name: 'Knights',    color: '#AB121B', logo: 'assets/logos/knights.png' }
  ]
};
```

House `name` must match the sheet column header exactly. A house in the sheet
with no matching config entry falls back to a grey circle with its first two
letters, and must not break the page.

### Feature parity checklist

Every one of these exists today and must survive the port. Work through the
list and confirm each one when you are done.

Overview screen:
- [ ] Rank cards, one per house, crest plus name plus points
- [ ] Race bars sized relative to the current leader, not to the theoretical max
- [ ] Points count up in an animation instead of snapping, with the pop flash
- [ ] FLIP animation when cards change order
- [ ] Leader card glow plus ambient sparkles
- [ ] Momentum arrows, up and down, versus the previous poll
- [ ] Pre-game state: no ranks, no leader, bullet instead of a number, no momentum
- [ ] Progress bar, games completed out of total, turns gold on completion
- [ ] Nail-biter callout when the top two are within `CLOSE_RACE_GAP`
- [ ] Rotating ticker on a 6 second cycle, using the full tagline pools: pregame, leading, closing, trailing, climbing, falling, close_race, general, champion
- [ ] Per-game breakdown table with the winner column, sole-winner cell highlighting, and tie handling
- [ ] Podium replaces the ranking list once every game is scored, with the champion ribbon, and it redraws if a score is corrected afterwards

Per-game screens:
- [ ] Left edge GAMES tab that opens a dropdown listing every game with status dots
- [ ] Full-screen single-game view with its own house cards scoped to that game
- [ ] Unscored houses shown dimmed with a dash
- [ ] Game-scoped ticker: not-started lines, winner lines, and deliberately silent while a game is in progress
- [ ] Status pill: Not Started, In Progress, Complete

Celebrations:
- [ ] Confetti in three modes: single burst, timed waves, and never-ending for the finale
- [ ] Screen flash and the pop-in banner
- [ ] The full clash cutscene, all six themes with their own loser animations, tag words and headline pools, running off a queue so triggers never overlap
- [ ] Double-click the Mesa logo to fire a celebration on demand
- [ ] `AUTO_CELEBRATIONS` off by default, because entering several games at once used to set off a runaway chain of animations

Reliability, and this part is new:
- [ ] If a poll fails, keep showing the last good data. Never blank the screen.
- [ ] Show a small, calm connection status in the corner where the timestamp sits. It should say when the data was last updated and go into a muted warning state after two consecutive failures.
- [ ] Retry with backoff, then return to the normal interval once a poll succeeds.
- [ ] `?mock=1` in the URL forces mock mode regardless of config, so the screen can be rehearsed with no network.

## Part 3: docs you must write

`README.md` covering, in order:
1. What this is and the data flow diagram
2. Local development, including how to run it without the API using mock mode
3. Deploying the Apps Script half, step by step, with the "publish a new version, do not just save" warning
4. Deploying to Netlify, both the drag-and-drop route and the Git route
5. Connecting a custom domain, including the DNS records to add
6. Event-day runbook: how to enter scores, what marks a game complete, how to trigger a celebration on stage
7. Troubleshooting table

`CLAUDE.md` with the architecture, the API contract, the constraints above and
the conventions you settled on, so a future session picks up without re-reading
everything.

`apps-script/README.md` with just the backend install and deploy steps.

## How to work

1. **Plan first.** Read the reference files, then give me a short plan: the phases you will work in, anything in the reference code you think is a bug worth fixing during the port, and any decision you need from me. Stop there and wait for my go-ahead. Do not start writing files.
2. Then build in phases, and pause briefly after each so I can look:
   - Phase 1: repo skeleton, `config.js`, `mock.json`, `CLAUDE.md`
   - Phase 2: `apps-script/Code.gs` plus its README
   - Phase 3: `index.html` and `style.css`, static, driven by `mock.json`
   - Phase 4: `script.js`, data layer and rendering, full feature parity
   - Phase 5: celebrations and the clash cutscene
   - Phase 6: reliability, error states, `README.md`, final pass
3. After every phase, tell me exactly what I need to do next in plain language, including anything you cannot do yourself.
4. Verify as you go. Open the site against `mock.json` and confirm the checklist items actually render, do not just claim they do. Include a second mock file for the completed-event state so the podium and champion path can be checked without waiting for a real event.
5. Ask me rather than guessing. Do not invent house names, hex codes or copy.

## Facts you need

- Houses: Vikings (yellow), Gladiators (green), Samurai (blue), Knights (red). Four houses, roughly 30 students each, cutting across the clubs.
- Sheet layout: `Game | Vikings | Gladiators | Samurai | Knights | Max Points`, one row per game, header in row 1, tab named `Scores`.
- Game names come from column A and change often. They must never be hardcoded anywhere.
- The crest PNGs are heraldic shields with warrior headgear, one bold colour each. I will drop the real files into `public/assets/logos/`. Create obvious placeholders in the meantime so nothing 404s.
- The Mesa wordmark SVG is inline inside `reference/current-Index.html`. Pull it out into `public/assets/mesa-logo.svg` and reference it properly.

## Definition of done

- `public/` deploys to Netlify by drag and drop with no build step and works.
- Point `API_URL` at a live Apps Script deployment and real scores appear within one refresh cycle.
- Every checklist item above is present and visibly working.
- Killing the network mid-event leaves the last good scores on screen with a visible but calm status, and it recovers on its own when the network returns.
- A person who has never seen the project can follow `README.md` from an empty machine to a live URL.

Start with the plan.
