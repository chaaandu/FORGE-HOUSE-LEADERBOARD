/**
 * HOUSE OLYMPICS LEADERBOARD - Apps Script JSON API
 *
 * This script does one job: read the Scores tab and hand it back as JSON.
 * It serves no HTML. The leaderboard itself is a separate static site that
 * fetches this URL.
 *
 *   Google Sheet  ->  this script (/exec)  ->  static site  ->  students
 *
 * The spreadsheet stays private. Only this endpoint is public, and the only
 * thing it exposes is game names and scores. No house colours, no crests,
 * no student data.
 *
 * SHEET LAYOUT EXPECTED (tab named "Scores"):
 *
 *   Game            | Vikings | Gladiators | Samurai | Knights | Max Points
 *   Tug of War      | 50      | 30         | 20      | 40      | 50
 *   Relay Race      |         |            |         |         | 50
 *
 *   Row 1 = headers. Column A = "Game". Last column = "Max Points".
 *   Every column between them is treated as a house, and the header text is
 *   the house name that gets sent to the site.
 *   Leave a house's cell blank until that game is scored. Blank means "not
 *   scored yet" and comes through as null, which is what drives the progress
 *   bar, the winner column and the podium. A zero is a real score of zero.
 *   Blank rows and any row labelled Total / Totals / Grand Total / Sum /
 *   Overall are ignored.
 *
 * Game names come straight from column A, so adding, renaming or reordering
 * games needs no code change at all. Neither does adding a house: the site
 * shows any unknown house as a grey circle until someone adds it to config.js.
 *
 * TO INSTALL AND DEPLOY: see README.md next to this file.
 */

/* ============================ CONFIG ============================ */

// Tab that holds the scores. If this tab does not exist, the first tab in
// the spreadsheet is used instead.
var SHEET_NAME = 'Scores';

// How long the computed payload is cached, in seconds. Every open screen
// polls every 20s, so a few seconds of cache keeps repeated sheet reads down
// when several TVs and laptops are showing the board at once.
var DATA_CACHE_SECONDS = 5;

// Bump this string if you ever change the shape of the payload and want to
// throw away everything currently cached.
var CACHE_KEY = 'hol_api_v3';

/* ========================== END CONFIG ========================== */


/**
 * The one public entry point.
 *
 * GET /exec               -> application/json
 * GET /exec?callback=foo  -> application/javascript, wrapped as foo({...})
 *
 * Cross-origin note, do not "simplify" this away: a browser on another
 * domain can only call an Apps Script web app with a plain GET and no custom
 * headers. The /exec URL 302-redirects to script.googleusercontent.com, and
 * it is that redirect target which sends the CORS header. Apps Script gives
 * you no way to set response headers yourself, so there is nothing to add
 * here. The ?callback= branch is the fallback for the day something on the
 * venue network blocks the redirect or strips CORS.
 */
function doGet(e) {
  var callback = null;
  var payload;

  try {
    var requested = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : null;

    // A JSONP callback name is injected straight into a <script> tag on the
    // page, so only ever allow a plain identifier through.
    //
    // Note the callback is only trusted AFTER it validates. Assigning it
    // first and validating second means a rejected name is still used to
    // wrap the error response, which hands the caller arbitrary JavaScript
    // execution: ?callback=evil(1);// would come back as
    //   evil(1);//({"ok":false,...});
    if (requested) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(requested)) {
        throw new Error('Invalid callback name.');
      }
      callback = requested;
    }

    payload = getScoreData_();

  } catch (err) {
    payload = {
      ok: false,
      error: (err && err.message) ? String(err.message) : 'Unknown error reading the sheet.'
    };
  }

  var json = JSON.stringify(payload);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}


/* ------------------------- SCORE READING ------------------------- */

function getScoreData_() {
  var cache = CacheService.getScriptCache();

  if (DATA_CACHE_SECONDS > 0) {
    var hit = cache.get(CACHE_KEY);
    if (hit) {
      try { return JSON.parse(hit); } catch (e) { /* fall through and recompute */ }
    }
  }

  var full = readSheet_();

  // Build the response explicitly rather than returning readSheet_() as-is,
  // so the public contract cannot drift when internal fields are added.
  var payload = {
    ok: true,
    houseNames: full.houseNames,
    games: full.games,
    ranking: full.ranking,
    gamesCompleted: full.gamesCompleted,
    totalGames: full.totalGames,
    totalMaxPoints: full.totalMaxPoints,
    generatedAt: full.generatedAt
  };

  if (DATA_CACHE_SECONDS > 0) {
    try {
      var json = JSON.stringify(payload);
      // CacheService rejects values over 100KB, so only cache if it fits.
      if (json.length < 95000) cache.put(CACHE_KEY, json, DATA_CACHE_SECONDS);
    } catch (e) { /* caching is optional, never let it break the board */ }
  }

  return payload;
}


function readSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('This script is not attached to a spreadsheet. Open the sheet, then Extensions > Apps Script.');

  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  if (!sheet) throw new Error('No sheet found in this spreadsheet.');

  var values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('The "' + sheet.getName() + '" tab is empty.');

  var header = values[0].map(cleanText_);

  // Find the "Max Points" column. Accepts a few spellings. If nothing is
  // labelled but the last header is blank, that blank column is assumed to
  // be Max Points (people often fill the numbers before naming the column).
  var maxPointsCol = -1;
  for (var c = 1; c < header.length; c++) {
    var h = header[c].toLowerCase();
    if (h === 'max points' || h === 'max point' || h === 'max' || h === 'maxpoints') {
      maxPointsCol = c;
      break;
    }
  }
  if (maxPointsCol === -1 && header.length > 2 && !header[header.length - 1]) {
    maxPointsCol = header.length - 1;
  }

  var lastHouseCol = (maxPointsCol === -1) ? header.length : maxPointsCol;

  // Track the actual column index for each house instead of assuming houses
  // sit in columns B, C, D, E with no gaps. A blank spacer column used to
  // shift every score by one column, which was the nastiest bug in the old
  // version because it failed silently and just showed wrong numbers.
  var houseNames = [];
  var houseCols = [];
  for (var c2 = 1; c2 < lastHouseCol; c2++) {
    if (header[c2]) {
      houseNames.push(header[c2]);
      houseCols.push(c2);
    }
  }
  if (!houseNames.length) {
    throw new Error('No house columns found. Row 1 should read: Game, then one column per house, then Max Points.');
  }

  var totals = {};
  houseNames.forEach(function (n) { totals[n] = 0; });

  var games = [];
  var gamesCompleted = 0;
  var totalMaxPoints = 0;
  var skipLabels = ['total', 'totals', 'grand total', 'sum', 'overall'];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var gameName = cleanText_(row[0]);
    if (!gameName) continue;
    if (skipLabels.indexOf(gameName.toLowerCase()) !== -1) continue;

    var gameScores = {};
    var allFilled = true;

    for (var i = 0; i < houseNames.length; i++) {
      var val = toNumber_(row[houseCols[i]]);
      if (val === null) {
        allFilled = false;
      } else {
        totals[houseNames[i]] += val;
      }
      // null, never 0 and never '', when a house has not been scored yet.
      gameScores[houseNames[i]] = val;
    }

    if (allFilled) gamesCompleted++;

    var maxPoints = null;
    if (maxPointsCol !== -1) {
      maxPoints = toNumber_(row[maxPointsCol]);
      if (maxPoints !== null) totalMaxPoints += maxPoints;
    }

    games.push({ name: gameName, scores: gameScores, maxPoints: maxPoints });
  }

  var ranking = houseNames.map(function (name) {
    return { name: name, total: totals[name] || 0 };
  });
  // Ties break alphabetically so the order stays stable between refreshes
  // instead of the cards shuffling around on every poll.
  ranking.sort(function (a, b) {
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });
  ranking.forEach(function (h, idx) { h.rank = idx + 1; });

  return {
    houseNames: houseNames,
    games: games,
    ranking: ranking,
    gamesCompleted: gamesCompleted,
    totalGames: games.length,
    totalMaxPoints: totalMaxPoints,
    sheetName: sheet.getName(),   // internal only, never sent to the browser
    generatedAt: new Date().toISOString()
  };
}


/* ------------------------------ HELPERS ------------------------------ */

function cleanText_(v) {
  if (v === null || typeof v === 'undefined') return '';
  return String(v).trim();
}

/**
 * Turns a cell into a number, or null if it is genuinely empty.
 * The old code only counted values where typeof was "number", so a score
 * typed into a text-formatted cell showed up on the board but was silently
 * left out of the totals. This handles that case.
 */
function toNumber_(v) {
  if (v === null || typeof v === 'undefined') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).trim();
  if (!s) return null;
  if (s === '-' || s === '–' || s === '—') return null;
  if (s.toLowerCase() === 'n/a' || s.toLowerCase() === 'na') return null;
  var n = Number(s.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}


/* ------------------------- SETUP AND CHECKS ------------------------- */

/**
 * Run this from the Apps Script editor (pick validateSheet, hit Run, then
 * open the execution log). It checks the sheet before students see the board
 * and tells you exactly what is wrong.
 *
 * It does NOT know about house colours or crests any more. Those live in the
 * static site's config.js, and a house the site does not recognise still
 * renders, just as a grey circle.
 */
function validateSheet() {
  var problems = [];
  var notes = [];

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    problems.push('No tab named "' + SHEET_NAME + '". Falling back to the first tab, "' + ss.getSheets()[0].getName() + '". Rename the tab or change SHEET_NAME.');
    sheet = ss.getSheets()[0];
  }

  var data;
  try {
    data = readSheet_();
  } catch (e) {
    problems.push('Could not read the sheet: ' + e.message);
    return report_(problems, notes);
  }

  notes.push('Tab read: ' + data.sheetName);
  notes.push('Houses found in sheet: ' + data.houseNames.join(', '));
  notes.push('Games found: ' + data.totalGames + ' (' + data.gamesCompleted + ' fully scored)');
  notes.push('Total max points across all games: ' + data.totalMaxPoints);
  notes.push('Copy these house names into public/config.js exactly as printed above.');

  // No house columns at all is already fatal in readSheet_, but a single
  // house usually means the header row is wrong.
  if (data.houseNames.length < 2) {
    problems.push('Only ' + data.houseNames.length + ' house column found. Check row 1 reads: Game, then one column per house, then Max Points.');
  }

  // Duplicate house columns silently overwrite each other in the payload.
  var seenHouse = {};
  data.houseNames.forEach(function (n) {
    var k = n.toLowerCase();
    if (seenHouse[k]) problems.push('Two columns are both headed "' + n + '". House names must be unique.');
    seenHouse[k] = true;
  });

  // Duplicate game names confuse the games menu on the site.
  var seen = {};
  data.games.forEach(function (g) {
    var k = g.name.toLowerCase();
    if (seen[k]) problems.push('Two games are both named "' + g.name + '". Give them different names.');
    seen[k] = true;
  });

  if (!data.totalGames) {
    problems.push('No game rows found. Column A should hold one game name per row, starting in row 2.');
  }

  // Missing Max Points
  var missingMax = data.games.filter(function (g) { return g.maxPoints === null; });
  if (missingMax.length) {
    notes.push('Max Points is blank for ' + missingMax.length + ' game(s): ' + missingMax.map(function (g) { return g.name; }).join(', '));
  }

  // Scores above the stated max, usually a typo
  data.games.forEach(function (g) {
    if (g.maxPoints === null) return;
    data.houseNames.forEach(function (n) {
      var v = g.scores[n];
      if (v !== null && v > g.maxPoints) {
        problems.push('"' + g.name + '": ' + n + ' scored ' + v + ' but Max Points is ' + g.maxPoints + '.');
      }
    });
  });

  // Text-formatted numbers. These now count correctly towards totals, but
  // they are still a sign someone pasted values in oddly, so flag them.
  var raw = sheet.getDataRange().getValues();
  for (var r = 1; r < raw.length; r++) {
    if (!cleanText_(raw[r][0])) continue;
    for (var c = 1; c < raw[r].length; c++) {
      var cell = raw[r][c];
      if (typeof cell === 'string' && cell.trim() && toNumber_(cell) !== null) {
        problems.push('Row ' + (r + 1) + ', column ' + columnLetter_(c + 1) + ' holds the number "' + cell + '" as text. Reformat the cell as a number.');
      }
    }
  }

  return report_(problems, notes);
}

function report_(problems, notes) {
  var out = [];
  out.push('--- NOTES ---');
  notes.forEach(function (n) { out.push('  ' + n); });
  out.push('');
  out.push(problems.length ? '--- PROBLEMS (' + problems.length + ') ---' : '--- NO PROBLEMS FOUND ---');
  problems.forEach(function (p) { out.push('  ! ' + p); });
  var text = out.join('\n');
  Logger.log(text);
  return text;
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

/**
 * Clears the cached payload. Run this if you have just corrected a score and
 * do not want to wait out the few seconds of cache.
 */
function clearCaches() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  Logger.log('Cache cleared. The next request will read the sheet fresh.');
}

/**
 * Builds the "Scores" tab with the right header row, ready for game rows.
 * Safe to run on an empty spreadsheet only, it refuses if a tab with that
 * name already has data.
 *
 * Edit the house names on the line below before running it.
 */
function setUpSheet() {
  var HOUSE_NAMES = ['Vikings', 'Gladiators', 'Samurai', 'Knights'];

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet && sheet.getLastRow() > 0) {
    throw new Error('The "' + SHEET_NAME + '" tab already has data. Clear it first if you really want to rebuild it.');
  }
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  var header = ['Game'].concat(HOUSE_NAMES).concat(['Max Points']);
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, header.length);
  Logger.log('Created header: ' + header.join(' | '));
}

/**
 * Prints the exact JSON the web app will return, into the execution log.
 * Useful for checking the payload without deploying anything.
 */
function previewApiResponse() {
  Logger.log(JSON.stringify(getScoreData_(), null, 2));
}
