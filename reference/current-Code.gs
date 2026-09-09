/**
 * HOUSE OLYMPICS LEADERBOARD - Apps Script backend
 *
 * Rebuilt for the new batch. Everything you normally change lives in the
 * CONFIG block below. House names, colours and crests are now defined ONCE
 * here and sent to the page, so Index.html no longer holds any house data.
 *
 * SHEET LAYOUT EXPECTED (tab named "Scores"):
 *
 *   Game            | Vikings | Gladiators | Samurai | Knights | Max Points
 *   Tug of War      | 50      | 30         | 20      | 40      | 50
 *   Relay Race      |         |            |         |         | 50
 *
 *   Row 1 = headers. Column A = "Game". Last column = "Max Points".
 *   Every column between them is a house, and the header text must match
 *   the "name" values in HOUSES below, exactly.
 *   Leave a house's cell blank until that game is scored.
 *   Blank rows and any row labelled Total / Totals / Grand Total are ignored.
 *
 * Game names come straight from column A, so adding, renaming or reordering
 * games needs no code change at all. Only house changes touch this file.
 */

/* ============================ CONFIG ============================ */

// Tab that holds the scores. If this tab does not exist, the first tab
// in the spreadsheet is used instead.
var SHEET_NAME = 'Scores';

// The houses. Order here does not matter, the sheet order is what the app
// follows. "name" MUST match the sheet column header exactly (spelling,
// spacing, capitalisation).
//
// Crest: pick ONE of the two options per house.
//   logoFile: filename of the PNG inside the Drive folder set below (easiest)
//   logoData: a full "data:image/png;base64,AAAA..." string pasted in here
// If neither resolves, the app quietly falls back to a coloured circle with
// the first two letters of the house name, so nothing breaks.
var HOUSES = [
  { name: 'Vikings',    color: '#F2BD0E', logoFile: 'vikings.png' },
  { name: 'Gladiators', color: '#40A261', logoFile: 'gladiators.png' },
  { name: 'Samurai',    color: '#1B3A6B', logoFile: 'samurai.png' },
  { name: 'Knights',    color: '#AB121B', logoFile: 'knights.png' }
];

// Drive folder holding the crest PNGs. Open the folder in Drive and copy the
// long id out of the URL: drive.google.com/drive/folders/THIS_PART_HERE
// Leave as '' if you are pasting base64 into logoData instead.
// The folder does not need to be public, the script reads it as you.
var LOGO_FOLDER_ID = '';

// Browser tab title and the big heading on the page.
var PAGE_TITLE = 'House Olympics Leaderboard';

// How long computed scores are cached, in seconds. The page polls every 20s
// per open screen, so a few seconds of cache keeps repeated sheet reads down
// when several TVs or laptops are showing the board at once.
var DATA_CACHE_SECONDS = 5;

// How long crest images are cached, in seconds. Bump the number in
// LOGO_CACHE_VERSION if you replace a PNG and want it picked up immediately.
var LOGO_CACHE_SECONDS = 21600; // 6 hours
var LOGO_CACHE_VERSION = 'v1';

/* ========================== END CONFIG ========================== */


function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(PAGE_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


/**
 * Called by the page every 20 seconds. Returns scores plus the house
 * colours and crests.
 */
function getLeaderboardData() {
  var payload = getScoreData_();
  payload.houses = getHouseMeta_(payload.houseNames);
  payload.pageTitle = PAGE_TITLE;
  return payload;
}


/* ------------------------- SCORE READING ------------------------- */

function getScoreData_() {
  var cache = CacheService.getScriptCache();
  var key = 'hol_scores_v2';

  if (DATA_CACHE_SECONDS > 0) {
    var hit = cache.get(key);
    if (hit) {
      try { return JSON.parse(hit); } catch (e) { /* fall through and recompute */ }
    }
  }

  var payload = readSheet_();

  if (DATA_CACHE_SECONDS > 0) {
    try {
      var json = JSON.stringify(payload);
      // CacheService rejects values over 100KB, so only cache if it fits.
      if (json.length < 95000) cache.put(key, json, DATA_CACHE_SECONDS);
    } catch (e) { /* caching is optional, never let it break the board */ }
  }

  return payload;
}


function readSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
    sheetName: sheet.getName(),
    generatedAt: new Date().toISOString()
  };
}


/* --------------------- HOUSE COLOURS AND CRESTS --------------------- */

function getHouseMeta_(houseNames) {
  return houseNames.map(function (name) {
    var cfg = findHouseConfig_(name);
    return {
      name: name,
      color: cfg ? cfg.color : null,   // null makes the page use its grey fallback
      logo: cfg ? getLogo_(cfg) : null,
      configured: !!cfg
    };
  });
}

function findHouseConfig_(name) {
  var target = String(name).trim().toLowerCase();
  for (var i = 0; i < HOUSES.length; i++) {
    if (String(HOUSES[i].name).trim().toLowerCase() === target) return HOUSES[i];
  }
  return null;
}

function getLogo_(cfg) {
  if (cfg.logoData) return cfg.logoData;
  if (!cfg.logoFile || !LOGO_FOLDER_ID) return null;

  var cache = CacheService.getScriptCache();
  var key = 'hol_logo_' + LOGO_CACHE_VERSION + '_' + cfg.logoFile;
  var hit = cache.get(key);
  if (hit) return (hit === 'MISSING') ? null : hit;

  try {
    var folder = DriveApp.getFolderById(LOGO_FOLDER_ID);
    var files = folder.getFilesByName(cfg.logoFile);
    if (!files.hasNext()) {
      cache.put(key, 'MISSING', 300);
      return null;
    }
    var blob = files.next().getBlob();
    var uri = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    if (uri.length < 95000) cache.put(key, uri, LOGO_CACHE_SECONDS);
    return uri;
  } catch (e) {
    return null;
  }
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
  if (s === '-' || s === '\u2013' || s === '\u2014') return null;
  if (s.toLowerCase() === 'n/a' || s.toLowerCase() === 'na') return null;
  var n = Number(s.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}


/* ------------------------- SETUP AND CHECKS ------------------------- */

/**
 * Run this from the Apps Script editor (pick validateSheet, hit Run, then
 * open the execution log). It checks the sheet and the config against each
 * other and tells you exactly what is wrong before students see the board.
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

  // Houses in the sheet with no matching entry in HOUSES
  data.houseNames.forEach(function (name) {
    if (!findHouseConfig_(name)) {
      problems.push('Sheet column "' + name + '" has no entry in HOUSES, so it will show grey with no crest. Check the spelling on both sides.');
    }
  });

  // Houses configured here that never appear in the sheet
  HOUSES.forEach(function (cfg) {
    var found = data.houseNames.some(function (n) {
      return n.trim().toLowerCase() === String(cfg.name).trim().toLowerCase();
    });
    if (!found) problems.push('HOUSES has "' + cfg.name + '" but no column with that header exists in the sheet.');
  });

  // Crest resolution
  HOUSES.forEach(function (cfg) {
    var logo = getLogo_(cfg);
    if (!logo) {
      problems.push('No crest loaded for "' + cfg.name + '". Check LOGO_FOLDER_ID and that the file "' + (cfg.logoFile || '(none set)') + '" exists in that folder.');
    } else {
      notes.push('Crest OK for ' + cfg.name + ' (' + Math.round(logo.length / 1024) + ' KB encoded)');
    }
  });

  // Duplicate game names confuse the side nav
  var seen = {};
  data.games.forEach(function (g) {
    var k = g.name.toLowerCase();
    if (seen[k]) problems.push('Two games are both named "' + g.name + '". Give them different names.');
    seen[k] = true;
  });

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

  // Text-formatted numbers, which the old code silently dropped
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
 * Clears the cached scores and crests. Run this after you swap a PNG or
 * rename a house and want the change on screen straight away.
 */
function clearCaches() {
  var cache = CacheService.getScriptCache();
  var keys = ['hol_scores_v2'];
  HOUSES.forEach(function (cfg) {
    if (cfg.logoFile) keys.push('hol_logo_' + LOGO_CACHE_VERSION + '_' + cfg.logoFile);
  });
  cache.removeAll(keys);
  Logger.log('Caches cleared. Refresh the leaderboard page.');
}

/**
 * Builds the "Scores" tab with the right headers and your house names,
 * ready for game rows. Safe to run on an empty spreadsheet only, it will
 * refuse if a tab with that name already has data.
 */
function setUpSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet && sheet.getLastRow() > 0) {
    throw new Error('The "' + SHEET_NAME + '" tab already has data. Clear it first if you really want to rebuild it.');
  }
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  var header = ['Game'].concat(HOUSES.map(function (h) { return h.name; })).concat(['Max Points']);
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, header.length);
  Logger.log('Created header: ' + header.join(' | '));
}
