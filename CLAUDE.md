# CLAUDE.md

Context for future sessions. Read this before changing anything; it will save
you re-reading the whole codebase.

## What this is

A live leaderboard for the Mesa **Forge** Olympics. Four houses (Vikings,
Gladiators, Samurai, Knights), roughly 30 students each. Scores are typed into
a Google Sheet during a live event and shown on a venue screen in front of
~120 students, plus a public URL.

This project is a **port**, not a redesign. It was originally a single
`Index.html` served by Apps Script itself via `google.script.run`. It was split
into an Apps Script JSON API plus a static site. The originals are in
`reference/` — **read-only, never modify them.** They remain the source of
truth for layout, animation and copy tone. The *palette and typography* now
come from `mesa_forge_design_system/` instead.

## Architecture

```
Google Sheet (private)
   ↓ read by
apps-script/Code.gs  — deployed as a web app, /exec, returns JSON only
   ↓ fetched every 20s, plain GET
public/  — static site, no build step, published as-is
   ↓
students
```

The two halves are independent. Changing a house colour touches only
`public/config.js`. Changing how the sheet is parsed touches only `Code.gs`.

## Constraints — do not violate these

1. **Vanilla HTML/CSS/JS only.** No React, no bundler, no npm install, no
   build step. `public/` must be publishable as-is by drag-and-drop.
2. **ES5 syntax in `public/script.js`.** `var` and `function` only. No arrow
   functions, no template literals, no `let`/`const`, no optional chaining, no
   `Array.prototype.find`, no `NodeList.forEach`, no `Element.remove()`, no
   two-argument `classList.toggle`. Runs on venue TVs and old laptops.
   `fetch` and `Promise` are acceptable. There are ES5-safe helpers at the top
   of `script.js` (`each`, `findBy`, `setClass`, `detach`) — use them.
3. **No external JS libraries, and no external font requests.** Fonts are
   self-hosted in `public/assets/fonts/`. Do not reintroduce a Google Fonts
   `@import` or `<link>` — the page must render with zero third-party
   requests, because venue wifi is not to be trusted.
4. **No secrets in the frontend.** Everything in `public/` is public. The
   Apps Script URL is public by design; nothing else goes there.
5. **The visual design follows `mesa_forge_design_system/design_system.md`.**
   This superseded the original brief's "do not change the visual design".
   The layout, animations and copy tone are still the port of
   `reference/current-Index.html`; the palette and type system are Forge.

## The Apps Script CORS rule — the big one

A browser on another domain can only call an Apps Script web app with a
**plain GET and no custom headers**. The `/exec` URL 302-redirects to
`script.googleusercontent.com`, and it is that redirect target which sends the
CORS header. Apps Script cannot set response headers itself.

Therefore, in `loadFromApi()`:

- No `headers` object, no `Content-Type`, no `Authorization`. Any custom
  header makes the request preflighted, which Apps Script cannot answer.
- Never `mode: 'no-cors'` — it returns an opaque response you cannot read.
- Always cache-bust (`withCacheBust()` appends `cb=<timestamp>`).

There is a **JSONP fallback**: `doGet` honours `?callback=name` and returns
JavaScript. If `fetch` fails, `script.js` injects a `<script>` tag instead.
This is the safety net for a venue network that blocks the normal request.

## API contract

Do not deviate from this shape.

```json
{
  "ok": true,
  "houseNames": ["Vikings", "Gladiators", "Samurai", "Knights"],
  "games": [
    { "name": "Tug of War",
      "scores": { "Vikings": 50, "Gladiators": 30, "Samurai": null, "Knights": 20 },
      "maxPoints": 50 }
  ],
  "ranking": [ { "name": "Vikings", "total": 120, "rank": 1 } ],
  "gamesCompleted": 3,
  "totalGames": 8,
  "totalMaxPoints": 400,
  "generatedAt": "2026-09-09T10:00:00.000Z"
}
```

Failure: `{ "ok": false, "error": "Human readable reason" }`

**An unscored house cell is `null` — never `0`, never `""`.** That distinction
drives the whole "game complete" logic: progress bar, Winner column, per-game
status pills, and the podium. `isScored()` in `script.js` is the only place
that should test it.

The API deliberately sends **no colours and no crests**. Those are owned by
`public/config.js`. `getScoreData_()` builds the response object explicitly
rather than returning `readSheet_()` directly, so internal fields (like
`sheetName`, used by `validateSheet`) cannot leak into the public contract.

## Sheet layout

Tab named `Scores`:

```
Game | Vikings | Gladiators | Samurai | Knights | Max Points
```

Row 1 is headers. Column A is the game name. Everything between column A and
`Max Points` is a house.

Behaviours that exist because they were bugs once — keep them:

- **Real column-index mapping** (`houseCols[]`). Do not assume houses sit in
  columns B–E with no gaps. A blank spacer column used to shift every score
  onto the wrong house, silently.
- **`toNumber_()`** coerces text-formatted cells. A score typed into a
  text-formatted cell used to display but not count toward totals.
- Rows labelled `Total`/`Totals`/`Grand Total`/`Sum`/`Overall` are skipped.
- **Ties break alphabetically** (`total` desc, then `name` asc). Without this,
  tied cards reshuffled on every poll.
- `CacheService` holds the computed payload for 5 seconds, so several screens
  polling at once do not each re-read the sheet.

**Game names come from column A and change often. Never hardcode them.**

## Design system

Source of truth: `mesa_forge_design_system/design_system.md`. Forge purple,
not Mesa green — "no green anywhere" in the brand chrome.

`style.css` declares the raw brand palette once in `:root`, then maps it to
**semantic tokens** that every rule references. Never put a raw hex in a
component rule; add or repoint a token instead.

    --aubergine #2A1849   dark surfaces (games menu, cutscene backdrop)
    --royal     #452A74   primary brand, headings, points
    --amethyst  #5A3A8E   secondary surfaces
    --violet    #7C4DCC   emphasis, ~5% of the page
    --orchid    #E4A7F3   soft highlight, ring motif, cutscene headline
    --lavender  #F5EDFB   page background
    --ink       #1D1C1D   body text

    -> --bg --panel --primary --primary-light --surface-dark --text
       --muted --border --hover --blank --accent --accent-soft --accent-ink

**There is no grey in this interface.** Every quieter tone is the same Royal
Purple at falling opacity, the way UIKit derives `label` -> `secondaryLabel`
-> `tertiaryLabel` -> `quaternaryLabel`. One hue, four weights:

    --label-1  var(--ink)                  primary text
    --label-2  rgba(69,42,116,0.78)        secondary: th, sub-lines, timestamps
    --label-3  rgba(69,42,116,0.50)        tertiary: the em-dash on unscored cells
    --label-4  rgba(69,42,116,0.14)        hairlines, never text

`--muted`, `--blank` and `--border` are aliases onto these. If you need a
quieter tone, take the next label weight; do not invent a hex.

**Never set a house colour as text colour.** Vikings yellow is 1.6:1 and
Gladiators green 2.9:1 on these surfaces. In the breakdown table the house
colour is carried by `.col-dot` and by the winner cell's background tint,
with the type staying in the label hierarchy.

Things that are deliberate, not oversights:

- **There is no gold.** `--accent` (Vivid Violet) carries the "winner /
  complete / urgent" role gold used to. The trophy glyphs carry the medal
  semantics instead.
- **House colours are exempt from the brand.** Gladiators is green because
  the crest students wear is green. They live in `config.js`, never in CSS.
- **Momentum arrows stay green/red.** That is data semantics, not brand.
- **Newsreader, not New York.** New York is Apple's system serif and is not
  licensed for web embedding. The design system nominates Newsreader as the
  substitute. Apple's TTFs are git-ignored so they never reach the public
  repo.
- **Fonts are self-hosted** variable woff2 (Manrope 24KB, Newsreader 132KB).
  The old build used a render-blocking Google Fonts `@import`, which is a bad
  bet on venue wifi.
- **The ring motif was removed** at the client's request. The design system
  calls for faint Orchid concentric rings on every surface; this screen does
  without them. If it is ever restored it belongs on `body::before`, and only
  `.wrap` should get a stacking context above it — do **not** put
  `position: relative` on `#side-nav-tab` or `#side-nav`, they are
  `position: fixed` and it drops them into normal flow.

Contrast was verified against WCAG AA for every fg/bg pair. Two failed and
were fixed: the cutscene headline (royal on violet, 2.1:1 -> aubergine on
orchid, 8.4:1) and the not-started pill (4.4:1 -> 8.6:1). Re-run that check
if you touch the palette.

## Responsive

The original had no media queries at all; the house card is a fixed 4-column
grid that overflows below ~700px. Breakpoints now: >=1700 (venue TV, scaled
up), <=1100 (laptop), <=860 (tablet), <=640 (phone), <=380 (small phone),
plus short-landscape.

On phones the card switches to two rows via `grid-template-areas`, and the
race bar is drawn by `.house-card::after` from a `--bar-pct` custom property
that `renderRanking()` sets alongside the normal `.race-fill` width. If you
change how the bar is sized, change both.

Also shipped: `prefers-reduced-motion`, `:focus-visible` rings, `100dvh` on
the hero, a print stylesheet, and the breakdown table scrolling sideways
inside `.table-scroll` with a mask fade.

## The house card

Layout is `rank · crest · name+sub · points`, one row at every width.

- **The race bar is the card's bottom edge** (`.house-card::after`, width from
  the `--bar-pct` custom property that `renderRanking` sets). It used to be a
  `.race-track`/`.race-fill` pair squashed into the middle column. As the
  card's base it reads from much further away, and every card starts at the
  same left edge so lengths compare directly. There is no separate bar
  element and no shimmer any more.
- **No "POINTS" label.** It was printed above the number on every card. A
  large figure in the last column of a scoreboard is self-evidently points.
- **The sub-line** under the house name carries the gap to the leader —
  "Leading" / "15 behind" / "Champion". Silent before the event, because
  "0 behind" for everyone is noise.
- **The leader's rank numeral is `--primary`, not its house colour.** A yellow
  numeral on white is 1.9:1. The house colour marks the leader on the border
  and the bar, where contrast rules do not apply to a graphic.

## Freshness copy

Relative, not a clock time: "Updated just now", "Updated 4 min ago". A clock
time makes the reader subtract. Apple Mail says "Updated Just Now"; Weather
says "Updated 3 minutes ago".

The wording carries the state: **"Updated X"** means live, **"Last updated X"**
means this is the most recent *success* and the data is stale. The exact clock
time lives in the `title` tooltip for whoever is running the event.

`renderConnection` is also on its own 20s interval, so the label ages while
polling is backing off instead of sitting on "just now" for a whole cycle.
`relativeTime()` clamps negative ages to zero — venue laptop clocks drift, and
`generatedAt` is server time.

## Removed on purpose — do not add these back

A rotating commentary ticker used to sit under the standings on the overview,
and again under each per-game view: a filled, rounded, dark block of centred
bold white text that faded to a new line every 6 seconds, drawing from nine
tagline pools (`leading`, `closing`, `trailing`, `climbing`, `falling`,
`close_race`, `general`, `champion`, `pregame`) plus per-game `winner` lines.

It was removed because it read as a button. Large filled rounded rectangle,
centred bold label, high contrast — every affordance says "click me", and it
was not clickable. On top of that, text that rewrites itself every six seconds
next to numbers that update every twenty competes with the scores for
attention, which is exactly backwards for a scoreboard.

What survives: `GAME_TEMPLATES.not_started`, rendered as one plain sentence
on a game that has not started yet. Plain text, no container, no rotation.

If the commentary is ever wanted back, it should be static type on the page
background with no filled container, not a pill.

The `← Overview` arrow in the games menu went for the same reason — it implied
browser-history "back", when the menu is a view switcher, not a stack.

## Conventions settled on during the port

- **`escapeHtml()` everything from the sheet** before it touches `innerHTML`.
  Game and house names are human-typed; a stray `&` or `<` used to break the
  row it was in.
- **Event delegation** for the games menu (`data-nav` attributes), not inline
  `onclick` built by string concatenation.
- **Card lookup via the `cardEls` map**, not attribute selectors. The old
  `cssEscape` only escaped `"` and `\`, so a house name containing `]` threw.
- **`animateNumber` uses a token guard** (`el.__animToken`). Two overlapping
  count-ups on one element used to fight over `textContent` and stutter.
- **Signature guards before expensive re-renders**: `podiumRendered` and
  `gameRendered`. Rebuilding the game view every 20s made a TV visibly
  flicker.
- **Server-reported errors are tagged `err.fromServer`** and are *not* retried
  over JSONP. A misconfigured sheet answers the same way twice, and retrying
  would double every screen's request rate against the Apps Script quota.
- `TICKER_MS` (6000) must stay in step with the `fadeInOut` animation duration
  in `style.css`.

## Reliability model

Deliberate, because this runs unattended in front of a room:

- A failed poll **never clears the screen.** `lastData` stays rendered.
- **One** failure changes nothing visible — a single dropped request is normal.
- **Two consecutive** failures show an amber pulsing dot and
  `Showing last scores from HH:MM:SS`. The underlying error is in the
  `title` tooltip and the console, not on screen.
- Backoff ladder `[5s, 10s, 20s, 40s, 60s]`, returning to `REFRESH_MS` on the
  first success.
- `?mock=1` / `?mock=complete` force sample data regardless of config, so the
  screen can be rehearsed with no network.
- A blank `API_URL` falls back to sample data with `Demo data · API_URL not
  set`, rather than a blank screen.
- `visibilitychange` triggers an immediate refresh, so a reopened laptop lid
  does not sit on stale scores waiting out the timer.

## Crests

`public/assets/logos/{vikings,gladiators,samurai,knights}.png`, lowercase,
referenced from `config.js`. Filenames are case-sensitive once deployed.

**Never hand-edit the files in `public/assets/logos/`.** They are generated.
Put source art in `crests-source/` and run `python3 tools/prepare-crests.py`,
which is a dependency-free pure-stdlib PNG pipeline (no PIL on the build
machine, and the project has a no-dependencies rule).

The tool:

- Strips the background by flood-filling inwards **from the border**, so dark
  areas inside the shield survive. The supplied originals were opaque black,
  which rendered as black rectangles on the cream `#FBF8F0` page and as black
  slabs in the clash cutscene. A naive "remove all black" punches holes
  through the artwork.
- Softens the anti-aliased fringe by luma, so there is no dark halo on cream.
- Trims to the artwork, then scales every crest to the **same** artwork height
  (600px) centred on an **identical** 420×620 canvas. This is the part that
  matters visually: the source files have different proportions and different
  built-in padding, so without it the four crests render at visibly different
  sizes. Cards set `height: 68px` with `width: auto`, so a shared canvas
  aspect ratio is what guarantees a uniform footprint.
- Box-downscales with **premultiplied** alpha, otherwise averaging against
  transparent black darkens every edge.

Untouched originals stay in `crests-source/`, which is outside the publish
directory so the ~2MB of source art never ships.

A house present in the sheet but missing from `CONFIG.HOUSES` falls back to a
grey circle with its first two letters. This must never break the page —
verified with a fifth unconfigured house.

## Feature checklist

All verified working against the mock data with headless Chrome.

**Overview:** rank cards · race bars sized to the current leader (not the
theoretical max) · animated count-up with pop flash · FLIP reorder animation ·
leader glow and ambient sparkles · momentum arrows vs the previous poll ·
pre-game state (bullets not ranks, no leader, no momentum) · progress bar
turning gold on completion · nail-biter callout within `CLOSE_RACE_GAP` ·
per-game breakdown with sole-winner highlighting and tie handling · podium
replacing the ranking list once every game is scored, redrawing if a score is
corrected.

**Per-game:** left-edge GAMES tab with status dots · full-screen single-game
view · unscored houses dimmed with a dash · one plain sentence on a game that
has not started · status pill.

**Celebrations:** confetti in three modes (single burst, timed waves,
never-ending finale) · screen flash · pop-in banner · clash cutscene with six
themes, their own loser animations, tag words and headline pools, running off
a queue so triggers cannot overlap · double-click the Mesa logo to fire one on
demand · `AUTO_CELEBRATIONS` off by default (entering several games at once
used to set off a runaway chain).

## Testing

No test framework, by design (no build step). Verification was done by:

- Serving `public/` and driving headless Chrome over the DevTools protocol to
  click through the side nav, game views and celebrations, then asserting on
  the live DOM.
- Simulating network loss by overriding `window.fetch` in-page, then checking
  the last scores stayed up and the status recovered.
- Running `Code.gs` in a Node `vm` against a fake `SpreadsheetApp` to cover
  the sheet edge cases: spacer columns, text-formatted numbers, `Total` rows,
  ties, dashes, `Max Points` spellings, JSONP callback validation.

If you change `Code.gs` or the data layer, redo the equivalent. Do not claim a
checklist item works without seeing it.

## Known gaps

- The house colours in `config.js` are the brand hexes from the original
  build, which are close to but not exactly the dominant colours sampled from
  the crest files (largest difference: Samurai `#1B3A6B` config vs `#2850A0`
  sampled). Left as-is deliberately — changing brand colours is the client's
  call, not a code decision.
- `AUTO_CELEBRATIONS` has never been exercised through a full real event.
- There is no deep link to a specific game view (`?game=3`). Would be a small
  addition if a second screen ever needs to boot straight into one game.
