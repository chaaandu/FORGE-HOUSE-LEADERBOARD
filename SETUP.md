# House Olympics leaderboard: Claude Code kit

Everything needed to rebuild the leaderboard as an Apps Script JSON API plus a
Netlify-hosted static site.

## What is in here

```
house-olympics-kit/
├── PROMPT.md                        paste this into Claude Code
├── SETUP.md                         this file
└── reference/
    ├── current-Code.gs              the working Apps Script backend
    ├── current-Index.html           the working single-file leaderboard
    └── DEPLOY.md                    how it is deployed today, plus known pitfalls
```

## How to use it

1. Unzip this folder somewhere sensible, for example `~/projects/house-olympics`.
2. Open a terminal in that folder.
3. Run `claude`.
4. Open `PROMPT.md`, copy all of it, paste it into Claude Code, hit enter.
5. Claude Code will read `reference/` and come back with a plan. Read the plan,
   then tell it to go.

Do not edit anything inside `reference/`. Those files are the source of truth
for how the leaderboard behaves today, and Claude Code will keep checking them
as it works.

## What you will need to supply when it asks

- The exact hex colours from the four crest files
- The four crest PNGs, to drop into `public/assets/logos/`
- Your Apps Script web app URL, once the backend half is deployed
- The custom domain, if you are pointing one at Netlify

## The two halves, once it is built

**Backend.** `apps-script/Code.gs` goes into the Apps Script editor attached to
the scores spreadsheet, deployed as a web app with access set to Anyone. It
returns JSON only. The sheet itself stays private.

**Frontend.** The `public/` folder is what Netlify publishes. No build step, so
drag and drop works. Paste the Apps Script URL into `public/config.js` before
deploying.
