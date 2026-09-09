# Deploying the House Olympics leaderboard

You have two routes. The same `Index.html` works for both, it detects where it
is running and picks its data source automatically.

---

## Do you need Apps Script if you deploy on Vercel or Netlify?

No. Vercel and Netlify only serve static files, they cannot read a private
Google Sheet on their own. So on that route the page reads the sheet directly
from the student's browser instead, and Apps Script is not involved at all.

The trade-off is the one thing you need to decide before picking a route:

| | Apps Script | Vercel / Netlify |
|---|---|---|
| Sheet can stay private | Yes | No, it must be link-viewable |
| Setup time | About 10 minutes | About 30 minutes |
| Cost | Free | Free |
| URL looks like | `script.google.com/macros/s/AKfy.../exec` | `houseolympics.netlify.app` |
| Logos | Drive folder or pasted base64 | Plain PNG files in a folder |
| Updates on screen | Within 20 seconds | Within 20 seconds |

**Security warning for the Vercel / Netlify route.** Link-viewable means the
whole spreadsheet is readable by anyone with the link, every tab in it. If the
same file holds the student roster (numbers, emails, CTC, mentor notes), do not
publish it. Make a brand new spreadsheet that contains nothing but the Scores
tab, and point the site at that one.

**My recommendation:** go with Apps Script. The sheet stays private, the URL is
ugly but you can hide it behind a bit.ly link, and it is running in ten minutes.
Move to Netlify later if you want the pretty URL.

---

# ROUTE A: Apps Script (recommended)

### Step 1: Files go in the Apps Script editor, not in folders

Apps Script has no folders. It is a flat list of files. Open your sheet, then
**Extensions > Apps Script**. You need exactly two files:

```
Code.gs      (server code)
Index.html   (the page)
```

The name `Index` matters. `Code.gs` refers to it by that exact spelling with a
capital I. If you name it `index.html` the page will not load.

To add a file: click the **+** next to Files, choose HTML, name it `Index`
(Apps Script adds the `.html` itself).

### Step 2: Paste the code

- Open `Code.gs`, select all, delete, paste the new `Code.gs`.
- Open `Index.html`, select all, delete, paste the new `Index.html`.
- Save both with Ctrl+S.

### Step 3: Set your houses

At the top of `Code.gs`:

```javascript
var HOUSES = [
  { name: 'Vikings',    color: '#F2BD0E', logoFile: 'vikings.png' },
  { name: 'Gladiators', color: '#40A261', logoFile: 'gladiators.png' },
  { name: 'Samurai',    color: '#1B3A6B', logoFile: 'samurai.png' },
  { name: 'Knights',    color: '#AB121B', logoFile: 'knights.png' }
];
```

The `name` must match your sheet column headers letter for letter. Set the
colours to the exact hex from the crest files.

### Step 4: Put the crest PNGs in a Drive folder

1. In Google Drive, make a folder, for example "House Olympics Logos".
2. Upload the four PNGs, named exactly as in `logoFile` above.
3. Open the folder and copy the id from the URL:
   `drive.google.com/drive/folders/`**`THIS_LONG_STRING`**
4. Paste it into `Code.gs`:

```javascript
var LOGO_FOLDER_ID = 'THIS_LONG_STRING';
```

The folder does not need to be shared publicly. The script reads it as you and
sends the image data into the page.

Transparent-background PNGs look best, especially in the clash cutscene.

### Step 5: Check the sheet

Your Scores tab needs this header row, and nothing above it:

```
Game | Vikings | Gladiators | Samurai | Knights | Max Points
```

Then one row per game. Leave a house's cell blank until the game is scored.
Game names come straight from column A, so renaming or adding games is a sheet
edit only, never a code change.

### Step 6: Run the checker

In the Apps Script editor, pick `validateSheet` from the function dropdown and
click **Run**. First time it asks for permission, approve it (choose your
account, then Advanced, then "Go to project (unsafe)", which is the normal
warning for your own scripts).

Read the execution log. It tells you about name mismatches, missing crests,
duplicate game names, scores above Max Points, and numbers stored as text. Fix
anything it flags before going further.

### Step 7: Deploy

1. **Deploy > New deployment**
2. Gear icon next to "Select type", choose **Web app**
3. Description: anything
4. Execute as: **Me**
5. Who has access: **Anyone** (this makes the page public, not the sheet)
6. **Deploy**, then copy the Web app URL

That URL ending in `/exec` is what you share with students.

### Step 8: Whenever you change the code later

Editing the code does not change the live page by itself. You must publish a
new version:

**Deploy > Manage deployments > pencil icon > Version: New version > Deploy**

This is the single most common reason people think their changes are not
working.

### Step 9: Make the link shareable

The `/exec` URL is long. Run it through bit.ly or tinyurl and share something
like `bit.ly/forge-house-olympics` on the student WhatsApp group.

---

# ROUTE B: Vercel or Netlify

Only do this if the scores live in their own spreadsheet with no student data
in it.

### Step 1: Build the folder

On your laptop, make a folder like this:

```
house-olympics/
├── index.html          (lowercase i here, this is a website now)
└── logos/
    ├── vikings.png
    ├── gladiators.png
    ├── samurai.png
    └── knights.png
```

Use the same `Index.html` from this pack, just save it as `index.html`.

### Step 2: Point it at the sheet

Near the top of the script block in `index.html`:

```javascript
var HOUSES = [
  { name: 'Vikings',    color: '#F2BD0E', logo: 'logos/vikings.png' },
  { name: 'Gladiators', color: '#40A261', logo: 'logos/gladiators.png' },
  { name: 'Samurai',    color: '#1B3A6B', logo: 'logos/samurai.png' },
  { name: 'Knights',    color: '#AB121B', logo: 'logos/knights.png' }
];

var SHEET_ID  = 'the long id from your sheet URL between /d/ and /edit';
var SHEET_TAB = 'Scores';
```

### Step 3: Share the sheet

Open the scores spreadsheet, **Share > General access > Anyone with the link >
Viewer**. Viewer, never Editor. Without this the page cannot read it and you
will see an error where the timestamp normally sits.

### Step 4: Test locally first

Double-clicking `index.html` will not work, browsers block the fetch on
`file://` URLs. Run a tiny local server instead. In a terminal, inside the
folder:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. If the scores load, you are ready to deploy.

### Step 5a: Netlify (easiest, no account setup needed to test)

1. Go to `app.netlify.com/drop`
2. Drag the whole `house-olympics` folder onto the page
3. Wait about 20 seconds, you get a URL like `random-name-123.netlify.app`
4. Sign in to claim the site, then **Site settings > Change site name** to
   something like `forge-house-olympics`

To update later, drag the folder onto the same site under **Deploys**.

### Step 5b: Vercel (better if you want version history)

1. Put the folder in a GitHub repo
2. Go to vercel.com, sign in with GitHub
3. **Add New > Project**, pick the repo
4. Framework preset: **Other**. Leave build command and output directory empty
5. **Deploy**

Every push to GitHub redeploys automatically.

### Step 6: Share the link

`forge-house-olympics.netlify.app` is short enough to put on a slide as is.

---

# Which folder does what, quick reference

| Thing | Apps Script route | Vercel / Netlify route |
|---|---|---|
| `Code.gs` | In the Apps Script editor | Not used |
| `Index.html` | In the Apps Script editor, named `Index` | In the site folder, named `index.html` |
| Crest PNGs | A Google Drive folder | A `logos/` folder next to `index.html` |
| Scores | The sheet, private | The sheet, link-viewable |

---

# Running the event day

- Keep one laptop or TV on the leaderboard URL. It refreshes every 20 seconds
  on its own, no reloading needed.
- Enter scores one game at a time. Fill all four house cells for a game before
  moving to the next one, that is what marks a game "complete" and drives the
  progress bar, the winner column and the podium.
- Double-click the Mesa logo to fire a celebration on demand, useful for the
  moment you announce a result on stage.
- The podium and the champion ribbon appear automatically once every game has
  all four cells filled.
- If you want automatic confetti on lead changes, set
  `AUTO_CELEBRATIONS = true` in `index.html`. Only do this if you are entering
  scores game by game during the event.

---

# If something breaks

**Page loads but the houses are grey with two-letter circles**
The house name in the sheet does not match the name in `HOUSES`. Check for
trailing spaces and spelling.

**Crests do not show (Apps Script route)**
Run `clearCaches` then reload. If still missing, run `validateSheet`, it will
tell you whether the file was found in the Drive folder.

**Crests do not show (static route)**
The file path is case sensitive on Netlify and Vercel. `Vikings.PNG` will not
match `logos/vikings.png`.

**"Error: Sheet returned 401 or 403" in the corner**
The sheet is not link-viewable. Redo Step 3 of Route B.

**Scores show on screen but totals look wrong**
Usually a number stored as text. `validateSheet` catches these and names the
exact cell.

**Changes to the code do not show up (Apps Script route)**
You edited without publishing a new version. See Route A, Step 8.

**Everything is one game behind**
Someone added a spacer column between the house columns. The new code handles
gaps correctly, but confirm the header row still reads
`Game, houses..., Max Points` with no stray columns.
