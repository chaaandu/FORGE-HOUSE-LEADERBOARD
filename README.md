# Forge Olympics Leaderboard

A live scoreboard for the Mesa Forge House Olympics. Four houses, roughly 30
students each, scores typed into a Google Sheet during the event and shown on
a screen in front of about 120 people, plus a public URL students can open on
their phones.

It refreshes itself every 20 seconds. Nobody has to touch it once it is up.

---

## Contents

1. [How it fits together](#1-how-it-fits-together)
2. [Local development](#2-local-development)
3. [Deploying the Apps Script half](#3-deploying-the-apps-script-half)
4. [Deploying the website](#4-deploying-the-website)
5. [Connecting a custom domain](#5-connecting-a-custom-domain)
6. [Event-day runbook](#6-event-day-runbook)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. How it fits together

Two independent halves. Either can be redeployed without touching the other.

```
┌─────────────────┐
│  Google Sheet   │   private, one tab named "Scores"
│  Game | scores  │
└────────┬────────┘
         │  read by
         ▼
┌─────────────────┐
│  Apps Script    │   apps-script/Code.gs
│  web app /exec  │   returns JSON only, no HTML
└────────┬────────┘   public URL, exposes scores and nothing else
         │  fetched every 20s
         ▼
┌─────────────────┐
│  Static site    │   public/  — plain HTML, CSS, JS
│  Vercel/Netlify │   no build step, no npm install
└────────┬────────┘
         │
         ▼
     120 students
```

**The sheet stays private.** Only the API is public, and all it can ever
return is game names and scores.

### What lives where

| File | Purpose |
|---|---|
| `apps-script/Code.gs` | The JSON API. Reads the sheet. Deployed inside Google, not here. |
| `public/config.js` | **The only file a non-developer needs to edit.** House names, colours, crest paths, API URL, refresh rate. |
| `public/index.html` | Page structure. |
| `public/style.css` | All styling and animations. |
| `public/script.js` | Data fetching, rendering, celebrations, reliability. |
| `public/mock.json` | Sample mid-event scores, for working offline. |
| `public/mock-complete.json` | Sample finished event, for rehearsing the podium. |
| `public/assets/logos/*.png` | The four house crests. |
| `public/assets/fonts/` | Manrope and Newsreader, self-hosted. No Google Fonts request at runtime. |
| `mesa_forge_design_system/` | The brand source of truth: palette, type rules, logos. Reference only, not published. |
| `crests-source/` | The original full-size crest files. Source for the tool below. Not published. |
| `tools/prepare-crests.py` | Regenerates the crest PNGs from `crests-source/`. Run after replacing artwork. |
| `reference/` | The previous single-file version. Read-only history, not used at runtime. |

### Hard constraints, and why

- **Vanilla HTML/CSS/JS. No framework, no bundler, no build step.** The
  `public/` folder is published exactly as it sits on disk, so it can be
  fixed from any laptop at the venue with a text editor.
- **ES5 syntax in `script.js`** — `var` and `function`, no arrow functions, no
  template literals. It runs on venue TVs and borrowed laptops with old
  browsers.
- **No secrets in the frontend.** Everything in `public/` is downloaded by
  every visitor. The Apps Script URL is public by design; nothing else goes
  there.

---

## 2. Local development

You need nothing installed except Python 3 (already on macOS and Linux) or any
other static file server.

```bash
cd public
python3 -m http.server 8000
```

Then open **http://localhost:8000**.

> **Double-clicking `index.html` will not work.** Browsers block `fetch` on
> `file://` URLs. You will see "Sample data cannot load from a file:// URL".
> Always use a local server.

### Working without the API

The site ships with sample data, so you never need a network or a deployed
backend to work on it.

| URL | Shows |
|---|---|
| `localhost:8000` | Live scores if `API_URL` is set, otherwise the sample data |
| `localhost:8000/?mock=1` | Sample mid-event scores, always |
| `localhost:8000/?mock=complete` | Sample finished event: podium, champion ribbon, gold progress bar |

`?mock=1` overrides `config.js` completely, so you can rehearse the screen at
the venue with the wifi switched off. There is also a `USE_MOCK` flag in
`config.js` if you want mock mode to be the permanent default.

If `API_URL` is left blank, the site quietly falls back to the sample data and
says `Demo data · API_URL not set` in the corner, rather than showing a blank
screen.

### Branding and the design system

The look follows `mesa_forge_design_system/design_system.md` — the Forge purple
identity, not the Mesa parent green.

**Colours.** Every colour is a CSS custom property at the top of `style.css`.
The brand palette is declared once, then mapped to semantic roles that the
components actually use, so re-skinning is a handful of lines:

| Token | Hex | Role |
|---|---|---|
| `--aubergine` | `#2A1849` | dark surfaces: the games menu, the cutscene backdrop |
| `--royal` | `#452A74` | primary brand, headings, points |
| `--amethyst` | `#5A3A8E` | secondary surfaces and fills |
| `--violet` | `#7C4DCC` | emphasis: champion, complete, urgent. ~5% of the page |
| `--orchid` | `#E4A7F3` | soft highlight, the ring motif, cutscene headline |
| `--lavender` | `#F5EDFB` | page background |
| `--ink` | `#1D1C1D` | body text |

The Forge system has no gold, so **Vivid Violet carries the "winner" role**
that gold used to, and the trophy glyphs do the medal semantics.

House colours are deliberately *not* part of this. They are tied to the
physical crests students wear, so Gladiators stays green even though the
brand system is purple-only. They live in `config.js`.

**Type.** Newsreader for the two display moments (the page title and the
podium heading), Manrope for everything else. Both are self-hosted variable
woff2 files, 156KB total.

> The design system names **New York** for display. That is Apple's system
> serif and is not licensed for embedding on a website, so this uses
> **Newsreader** — the substitute the design system itself nominates. Apple's
> files are in `mesa_forge_design_system/fonts/` for reference and are
> git-ignored so they never reach the public repo.

**Contrast** was checked against WCAG AA across every foreground/background
pair. Two failed and were fixed: the cutscene headline (was 2.1:1, now 8.4:1)
and the "Not Started" pill (was 4.4:1, now 8.6:1).

### Responsive

The board has three audiences and a breakpoint for each:

| Width | Behaviour |
|---|---|
| ≥1700px | Venue TV. Type and spacing scale up to be read across a room. |
| 1100–1700px | Laptop driving the screen. The default. |
| ≤860px | Tablet. Tighter grid, smaller crests. |
| ≤640px | Phone. The house card becomes two rows — identity on top, full-width race bar underneath — so names and scores never get squeezed. The breakdown table scrolls sideways with a fade on the edge. |
| ≤380px | Small phone. |

Also handled: `prefers-reduced-motion` (this page is almost entirely
animation, so it respects the OS setting and stops moving while still showing
every score), keyboard focus rings, `100dvh` so the mobile address bar does
not crop the hero, and a print stylesheet for a final results sheet.

### Changing houses, colours or copy

Everything a non-developer would want to change is in **`public/config.js`**,
with a comment on each setting. Editing it needs no rebuild — save, redeploy,
done.

`EVENT_TITLE` drives the page heading and the browser tab, so renaming the
event is a one-line change.

House `name` must match the sheet column header **exactly**. A house in the
sheet with no matching config entry still renders, as a grey circle with its
first two letters, and nothing breaks.

### Replacing the crests

Put the new artwork in **`crests-source/`**, named after the houses
(`Vikings.png`, `Gladiators.png`, `Samurai.png`, `Knights.png` — capitalisation
and a trailing "s" are both fine), then run:

```bash
python3 tools/prepare-crests.py
```

That writes web-ready files into `public/assets/logos/`. Commit and push, and
the site picks them up. Nothing else needs changing.

The tool does four things that matter:

- **Removes the background.** It flood-fills inwards from the border, so dark
  areas *inside* the shield survive. The crests supplied for this build had
  solid black backgrounds, which would otherwise have shown as black
  rectangles on the cream page and as black slabs in the clash cutscene.
- **Normalises the size.** Every crest is scaled to the same artwork height
  and centred on an identical 420×620 canvas, so all four render at exactly
  the same size on the cards no matter what shape the source art was.
- **Trims and centres** the artwork, ignoring whatever padding the source had.
- **Downscales** for the web, roughly 500KB → 210KB each.

It only reads PNGs. If you have JPEGs, export them as PNG first — it will tell
you which ones it skipped. The originals in `crests-source/` are never
modified.

If you would rather bypass the tool and drop finished files straight into
`public/assets/logos/`, they must be named `vikings.png`, `gladiators.png`,
`samurai.png`, `knights.png`, all lowercase, with transparent backgrounds and
matching dimensions. Filenames are case-sensitive once deployed —
`Vikings.PNG` will not match `assets/logos/vikings.png`.

---

## 3. Deploying the Apps Script half

Full step-by-step, including the sheet layout, is in
**[`apps-script/README.md`](apps-script/README.md)**. The short version:

1. Open the spreadsheet → **Extensions → Apps Script**.
2. Paste in `apps-script/Code.gs`, replacing everything. Save.
3. Run **`validateSheet`** from the function dropdown and read the log. Fix
   anything it reports before the event.
4. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access:
   **Anyone***. Deploy, copy the URL ending in `/exec`.
5. Paste that URL into `public/config.js` as `API_URL`.

> ### ⚠️ Publish a new version, do not just save
>
> Editing the script and pressing save **does not change the live URL.** To
> push a change live:
>
> **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**
>
> This is the single most common reason people think their changes did
> nothing. Keep editing the *same* deployment — creating a new one gives you a
> new `/exec` URL that you would have to paste into `config.js` again.

Sanity check: open the `/exec` URL in a browser. You should see raw JSON
beginning `{"ok":true,...}`.

---

## 4. Deploying the website

There is no build step. `public/` is published as-is. Both configs are
included: `vercel.json` and `netlify.toml`.

Before deploying, make sure `API_URL` in `public/config.js` is set to your
`/exec` URL.

### Route A: GitHub → Vercel (recommended, gives you version history)

```bash
git init
git add .
git commit -m "House Olympics leaderboard"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

Then:

1. Go to **vercel.com** and sign in with GitHub.
2. **Add New → Project**, pick the repo.
3. Framework preset: **Other**.
4. **Root Directory: leave as the repo root.** `vercel.json` already points
   the output at `public/`.
5. Leave Build Command and Install Command **empty**.
6. **Deploy.**

You get a URL like `your-repo.vercel.app`. Every push to `main` redeploys
automatically, usually in under a minute.

To change a score colour or the event title later: edit `public/config.js`,
commit, push. That is the whole update process.

### Route B: Netlify drag-and-drop (fastest, no account needed to test)

1. Go to **app.netlify.com/drop**
2. Drag the **`public`** folder onto the page. Not the repo root — the
   `public` folder itself.
3. Wait ~20 seconds. You get a URL like `random-name-123.netlify.app`.
4. Sign in to claim it, then **Site settings → Change site name** to something
   like `mesa-house-olympics`.

To update later, drag the folder onto the same site under **Deploys**.

### Route C: GitHub → Netlify

Same push as Route A, then in Netlify: **Add new site → Import an existing
project**, pick the repo. `netlify.toml` already sets the publish directory to
`public` and the build command to nothing.

### Checking the deploy

Open the URL. Within one refresh cycle (20 seconds) you should see real
scores, and the corner should read **`Updated HH:MM:SS`** with a green dot.

If it says `Demo data · API_URL not set`, you deployed before pasting the
`/exec` URL into `config.js`.

---

## 5. Connecting a custom domain

Say you want `houseolympics.mesaschool.co`.

### On Vercel

1. Project → **Settings → Domains → Add**, type the domain, **Add**.
2. Vercel shows you the record to create. For a subdomain it is a `CNAME`:

   | Type | Name | Value |
   |---|---|---|
   | `CNAME` | `houseolympics` | `cname.vercel-dns.com` |

   For a bare root domain (`mesaschool.co` itself) it is an `A` record instead:

   | Type | Name | Value |
   |---|---|---|
   | `A` | `@` | `76.76.21.21` |

3. Add that record at whoever hosts your DNS (GoDaddy, Cloudflare, Google
   Domains, your IT team).
4. Wait. Usually a few minutes, occasionally up to 24 hours. Vercel issues the
   HTTPS certificate automatically once the record resolves.

### On Netlify

1. Site → **Domain management → Add a domain**.
2. For a subdomain:

   | Type | Name | Value |
   |---|---|---|
   | `CNAME` | `houseolympics` | `YOUR-SITE-NAME.netlify.app` |

   For a root domain, use Netlify's four `A` records or switch your nameservers
   to Netlify DNS, whichever your DNS provider makes easier.
3. Netlify provisions the HTTPS certificate automatically. If it does not
   appear, **Domain management → HTTPS → Verify DNS configuration**.

**Always confirm the exact values in the dashboard rather than copying the
table above.** Providers do change these.

> Whoever controls the DNS for `mesaschool.co` has to make this change. If
> that is not you, send them the record type, name and value from the
> dashboard, and expect it to take a day.

Nothing in the code needs to change for a custom domain. The frontend calls
the Apps Script URL directly and does not care what domain it is served from.

---

## 6. Event-day runbook

### Before the event

- [ ] Run **`validateSheet`** in the Apps Script editor. Fix everything under
      `PROBLEMS`.
- [ ] Open the public URL on the actual venue screen and check the crests
      load and the text is readable from the back of the room.
- [ ] Confirm the corner says `Updated HH:MM:SS` with a green dot, not
      `Demo data`.
- [ ] Enter one test score, confirm it appears on screen within 20 seconds,
      then delete it.
- [ ] Rehearse the finish with `?mock=complete` so you know what the podium
      looks like before the room sees it.
- [ ] Decide about `AUTO_CELEBRATIONS` (see below). It ships **off**.

### Entering scores

Type numbers into the `Scores` tab. The screen picks them up within 20
seconds. Nobody needs to reload anything.

- **Enter one game at a time, and fill all four house cells before moving on.**
  A game only counts as complete when every house cell in its row is filled.
  That is what advances the progress bar, fills in the Winner column, and
  eventually triggers the podium.
- **Leave a cell blank until it is scored.** Blank means "not scored yet" and
  shows as a dash. A `0` is a real score of zero.
- Correcting a mistake is safe at any point. Retype the cell; the board
  catches up on the next poll, and the podium redraws if the standings change.

### Triggering a celebration on stage

**Double-click the Mesa logo**, top-left of the screen. That fires confetti, a
screen flash, a banner and the clash cutscene for whoever is currently
leading. Use it at the moment you announce a result.

It works whether or not `AUTO_CELEBRATIONS` is on, and it always reflects the
current standings.

### Automatic celebrations

`AUTO_CELEBRATIONS` in `config.js` is **off by default, on purpose.** When on,
confetti and the clash cutscene fire by themselves on lead changes and every
`MILESTONE_STEP` points.

Only turn it on if scores are being entered strictly one game at a time.
Pasting in several games at once queues a long chain of animations that plays
out over minutes and cannot be stopped.

### When every game is scored

The ranking list is replaced by the podium, the champion ribbon appears, the
progress bar fills violet-to-orchid and reads `Final Results`. It happens on
its own; there is no button to press.

If you correct a score afterwards, the podium redraws to match.

### Per-game screens

The **GAMES** tab on the left edge opens a list of every game with a status
dot: grey = not started, green = in progress, gold = complete. Click one for a
full-screen view of that game alone. Useful on a second screen next to the
activity that is currently running.

### If the network drops mid-event

**Nothing happens on screen.** The last good scores stay up. After two failed
polls in a row, the corner quietly changes to `Showing last scores from
HH:MM:SS` with an amber dot. The page keeps retrying on a backoff and returns
to normal by itself when the network comes back. There is nothing to do and
nothing to restart.

If you need to keep presenting with no network at all, add `?mock=1` to the
URL for the sample data.

---

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Corner says **`Demo data · API_URL not set`** | `API_URL` in `public/config.js` is blank. Paste your `/exec` URL in and redeploy. |
| Corner says **`Showing last scores from …`** with an amber dot | Two or more polls failed. The scores shown are the last good ones. Check the venue wifi; it recovers on its own. Hover the text for the underlying error. |
| Corner says **`Can't reach the scoreboard`** | It has never loaded successfully. Open the `/exec` URL directly in a browser — if that fails, the problem is the deployment, not the site. |
| Houses show as **grey circles with two letters** | The house name in the sheet does not match `name` in `config.js`. Check for trailing spaces and capitalisation. Run `validateSheet`. |
| **Crests do not load** | Filenames are case-sensitive once deployed. They must be exactly `vikings.png`, `gladiators.png`, `samurai.png`, `knights.png`, lowercase, in `public/assets/logos/`. |
| Crests appear as **black rectangles** | The PNG has an opaque background. It needs a transparent one. |
| **Changes to `Code.gs` do nothing** | You saved without publishing. **Deploy → Manage deployments → pencil → New version → Deploy.** |
| **Changes to `config.js` do nothing** | Hard-reload the browser (Cmd/Ctrl+Shift+R). If it persists, confirm the deploy actually finished. |
| Scores on screen but **totals look wrong** | Usually a number stored as text. `validateSheet` names the exact cell. |
| **Everything is one house out** | A spacer column was added between the house columns. The code handles gaps correctly, but check row 1 still reads `Game`, houses…, `Max Points` with no stray columns. |
| A game **never completes** | One house cell in that row is still blank. All four must be filled. |
| API returns **`{"ok":false,"error":"No tab named \"Scores\""}`** | The tab was renamed. Rename it back, or change `SHEET_NAME` at the top of `Code.gs` and publish a new version. |
| **Nothing loads, console says CORS** | Something added a header to the fetch. The Apps Script call must be a plain `GET` with no custom headers. See the comment at the top of `public/script.js`. |
| **Blank page, `file://` in the address bar** | You opened `index.html` by double-clicking. Run a local server instead — see [Local development](#2-local-development). |
| Animations **will not stop** | `AUTO_CELEBRATIONS` is on and several games were entered at once. Set it to `false` in `config.js` and redeploy, or just reload the page. |

### Getting more detail

Open the browser console (F12). Failed polls are logged with the reason and a
running count. Hovering the status text in the corner shows the same reason as
a tooltip.

To see exactly what the API is returning, open the `/exec` URL directly in a
browser tab.
