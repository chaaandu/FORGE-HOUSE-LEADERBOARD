# The Apps Script half

This folder holds `Code.gs`, the JSON API that reads the scores spreadsheet.
It is the only piece that ever touches the sheet. It serves no HTML.

```
Google Sheet  ->  Code.gs, deployed as a web app  ->  /exec URL  ->  the website
```

The spreadsheet stays private. The `/exec` URL is public, and the only thing
it gives away is game names and scores.

---

## 1. Prepare the sheet

One tab named **`Scores`**, with this header row and nothing above it:

```
Game | Vikings | Gladiators | Samurai | Knights | Max Points
```

Then one row per game. For example:

| Game | Vikings | Gladiators | Samurai | Knights | Max Points |
|---|---|---|---|---|---|
| Tug of War | 50 | 30 | 20 | 40 | 50 |
| Relay Race | | | | | 50 |

Rules that matter:

- **Leave a cell blank until that game is scored.** Blank means "not scored
  yet". A `0` is a real score of zero and counts as scored. This distinction
  is what drives the progress bar, the winner column and the podium.
- A game counts as complete when **every** house cell in its row is filled.
- Game names come from column A. Add, rename and reorder games freely, no code
  change is ever needed.
- Rows labelled `Total`, `Totals`, `Grand Total`, `Sum` or `Overall` are
  ignored, as are blank rows.
- House names come from row 1. They are sent to the website as-is, so they
  must match the `name` values in `public/config.js` exactly — same spelling,
  same capitalisation. A house that does not match still appears, as a grey
  circle with its first two letters.

## 2. Install the script

1. Open the spreadsheet.
2. **Extensions → Apps Script**. A new tab opens with an empty `Code.gs`.
3. Select everything in `Code.gs`, delete it, and paste in the contents of
   the `Code.gs` next to this README.
4. **Ctrl+S** / **Cmd+S** to save.

There is only one file. Apps Script has no folders, and nothing else from this
repo belongs in the editor.

If you are starting from a blank spreadsheet, you can run `setUpSheet` from
the function dropdown to create the `Scores` tab with the right header row.
Edit the house names on the first line of that function first.

## 3. Check the sheet before anyone sees it

In the Apps Script editor, pick **`validateSheet`** from the function dropdown
and click **Run**.

The first run asks for permission. Choose your account, then **Advanced**,
then **"Go to project (unsafe)"**. That warning is the standard one for a
script you wrote yourself; it is not a sign anything is wrong.

Open the execution log (**View → Logs**). It reports:

- which tab was read, and the house names it found
- how many games exist and how many are fully scored
- duplicate house or game names
- scores higher than that game's Max Points, which are usually typos
- numbers stored as text, naming the exact cell

Fix anything under `PROBLEMS` before the event.

To see the exact JSON the website will receive, run **`previewApiResponse`**
and read the log.

## 4. Deploy

1. **Deploy → New deployment**
2. Click the gear next to "Select type" and choose **Web app**
3. Description: anything, e.g. `House Olympics API v1`
4. **Execute as: Me**
5. **Who has access: Anyone**

   This makes the *API* public, not the spreadsheet. It has to be `Anyone`,
   because students' browsers call it without signing in.
6. **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

Paste that URL into `public/config.js` as `API_URL`, then redeploy the
website.

Check it works by opening the `/exec` URL directly in a browser. You should
see raw JSON starting with `{"ok":true,...}`.

## 5. Whenever you change this code later

**Editing and saving does not update the live URL.** You must publish a new
version:

> **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**

This is the single most common reason people think their changes did nothing.
Keep the same deployment so the `/exec` URL stays the same — creating a *new*
deployment gives you a *new* URL, which you would then have to paste into
`config.js` again.

---

## The functions in this file

| Function | What it does |
|---|---|
| `doGet(e)` | The public endpoint. Returns JSON, or JSONP when called with `?callback=`. Never throws a stack trace at the browser. |
| `validateSheet()` | Pre-flight check. Run this before the event. |
| `previewApiResponse()` | Prints the exact JSON payload to the log. |
| `clearCaches()` | Drops the cached payload. Run after correcting a score if you do not want to wait out the 5-second cache. |
| `setUpSheet()` | Creates the `Scores` tab with the right headers. Refuses to run if the tab already has data. |

## The response

Success:

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

Failure:

```json
{ "ok": false, "error": "Human readable reason" }
```

A house that has not been scored yet is `null` — never `0`, never `""`.

Colours and crests are deliberately **not** in this payload. They belong to
the website, in `public/config.js`, so changing a house colour never requires
touching or redeploying the backend.

## Why the API is GET-only with no custom headers

A browser on another domain (your Vercel or Netlify site) can only call an
Apps Script web app with a plain `GET` and no custom headers. The `/exec` URL
sends a 302 redirect to `script.googleusercontent.com`, and it is that
redirect target which returns the CORS header. Apps Script gives you no way
to set response headers yourself.

So, in the frontend: no `Content-Type`, no `Authorization`, no custom headers
of any kind, and never `mode: 'no-cors'` (which returns an opaque response you
cannot read). `public/script.js` already respects all of this — the rules are
repeated in a comment there so nobody "tidies" them away.

The `?callback=` JSONP branch exists as a safety net for the day a venue
network or a locked-down browser blocks the normal request. The frontend falls
back to it automatically.
