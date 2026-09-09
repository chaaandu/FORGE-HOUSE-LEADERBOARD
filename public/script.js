/**
 * HOUSE OLYMPICS LEADERBOARD - frontend
 *
 * Plain ES5. No build step, no libraries, no framework. This runs on venue
 * TVs and borrowed laptops, so: var and function only, no arrow functions,
 * no template literals, no let/const, no optional chaining. fetch and Promise
 * are the only modern things assumed, and even fetch has a fallback.
 *
 * Everything a non-developer might want to change lives in config.js.
 *
 * Data flow:
 *   Google Sheet -> Apps Script /exec (JSON) -> this file -> the screen
 *
 * Cross-origin note: the Apps Script call MUST be a plain GET with no custom
 * headers. Do not add headers, do not use mode:'no-cors'. See README.md.
 */

(function () {
  'use strict';

  /* ================================================================
     SMALL HELPERS
     ES5-safe replacements for the modern methods it would be easy to
     reach for. Old TV browsers do not have find(), NodeList.forEach(),
     Element.remove() or classList.toggle(cls, force).
     ================================================================ */

  function each(list, fn) {
    for (var i = 0; i < list.length; i++) fn(list[i], i);
  }

  function findBy(arr, key, value) {
    if (!arr) return null;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i][key] === value) return arr[i];
    }
    return null;
  }

  function setClass(el, cls, on) {
    if (!el) return;
    if (on) el.classList.add(cls);
    else el.classList.remove(cls);
  }

  function detach(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  /**
   * Everything that comes out of the spreadsheet goes through this before it
   * touches innerHTML. Game names and house names are typed by humans into a
   * shared sheet, and a stray & or < used to break the row it was in.
   */
  function escapeHtml(v) {
    return String(v === null || typeof v === 'undefined' ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fill(str, map) {
    return str.replace(/\{(\w+)\}/g, function (whole, k) {
      var v = map ? map[k] : null;
      if (typeof v !== 'undefined' && v !== null) return v;
      // {event} resolves from config, so copy never hard-codes the event name.
      if (k === 'event') return (CONFIG && CONFIG.EVENT_TITLE) || 'Olympics';
      return '';
    });
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function initials(name) {
    return String(name || '?').slice(0, 2).toUpperCase();
  }

  function urlParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  function withCacheBust(url, extra) {
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + (extra ? extra + '&' : '') + 'cb=' + new Date().getTime();
  }

  /* ================================================================
     HOUSE METADATA
     Colours and crests are owned entirely by config.js now. The API
     never sends them. A house that turns up in the sheet with no
     config entry falls back to a grey circle and must not break
     anything.
     ================================================================ */

  var FALLBACK_COLOR = '#8B7FA6';
  var HOUSE_META = {};

  function findHouseConfig(name) {
    var target = String(name).trim().toLowerCase();
    var houses = (CONFIG && CONFIG.HOUSES) || [];
    for (var i = 0; i < houses.length; i++) {
      if (String(houses[i].name).trim().toLowerCase() === target) return houses[i];
    }
    return null;
  }

  function applyHouseMeta(data) {
    HOUSE_META = {};
    each(data.houseNames || [], function (name) {
      var cfg = findHouseConfig(name);
      HOUSE_META[name] = {
        color: (cfg && cfg.color) || FALLBACK_COLOR,
        logo: (cfg && cfg.logo) || null,
        configured: !!cfg
      };
    });
  }

  function getMeta(name) {
    return HOUSE_META[name] || { color: FALLBACK_COLOR, logo: null, configured: false };
  }

  function houseColors() {
    var out = [];
    for (var n in HOUSE_META) {
      if (Object.prototype.hasOwnProperty.call(HOUSE_META, n)) out.push(HOUSE_META[n].color);
    }
    return out.length ? out : [FALLBACK_COLOR];
  }

  /** Crest markup, or the grey two-letter circle when there is no crest. */
  function crestHtml(name) {
    var meta = getMeta(name);
    if (meta.logo) {
      return '<img src="' + escapeHtml(meta.logo) + '" alt="' + escapeHtml(name) + '">';
    }
    return '<div class="fallback-badge">' + escapeHtml(initials(name)) + '</div>';
  }

  /* ================================================================
     DATA LAYER
     One job: hand a valid payload to onSuccess, or an Error to
     onError. Never throws at the caller.
     ================================================================ */

  var FETCH_TIMEOUT_MS = 12000;
  var JSONP_TIMEOUT_MS = 12000;

  // Mock mode. ?mock=1 forces the in-progress sample, ?mock=complete forces
  // the finished-event sample, both regardless of what config.js says, so the
  // screen can be rehearsed with no network at all.
  var mockParam = urlParam('mock');
  var MOCK_FILE = null;
  var MOCK_REASON = '';

  if (mockParam === 'complete' || mockParam === '2') {
    MOCK_FILE = 'mock-complete.json';
    MOCK_REASON = 'url';
  } else if (mockParam) {
    MOCK_FILE = 'mock.json';
    MOCK_REASON = 'url';
  } else if (CONFIG.USE_MOCK) {
    MOCK_FILE = 'mock.json';
    MOCK_REASON = 'config';
  } else if (!CONFIG.API_URL) {
    // Nobody has pasted the Apps Script URL in yet. Show the sample data
    // rather than a blank screen, and say so in the corner.
    MOCK_FILE = 'mock.json';
    MOCK_REASON = 'no-url';
  }

  /**
   * Rejects anything that is not a usable payload, with a readable reason.
   *
   * Errors raised here are tagged fromServer, meaning the request itself got
   * through and the far end answered. There is no point retrying those over
   * JSONP: a renamed sheet tab will give the same answer twice, and doubling
   * the request rate on every screen would eat into the Apps Script quota
   * for no benefit.
   */
  function serverError(message) {
    var err = new Error(message);
    err.fromServer = true;
    return err;
  }

  function checkPayload(data) {
    if (!data || typeof data !== 'object') {
      throw serverError('The scoreboard service sent an empty response.');
    }
    if (data.ok === false) {
      throw serverError(data.error || 'The scoreboard service reported a problem.');
    }
    if (!data.houseNames || !data.houseNames.length) {
      throw serverError('No houses found in the sheet. Check the header row.');
    }

    // Be forgiving about anything optional, so one missing field cannot
    // take the whole screen down mid-event.
    data.games = data.games || [];
    data.ranking = data.ranking || [];
    data.gamesCompleted = data.gamesCompleted || 0;
    data.totalGames = (typeof data.totalGames === 'number') ? data.totalGames : data.games.length;
    data.totalMaxPoints = data.totalMaxPoints || 0;
    data.generatedAt = data.generatedAt || new Date().toISOString();

    each(data.ranking, function (h, i) {
      if (typeof h.rank !== 'number') h.rank = i + 1;
      if (typeof h.total !== 'number') h.total = 0;
    });

    return data;
  }

  function loadMock(onSuccess, onError) {
    if (typeof fetch !== 'function') {
      onError(new Error('This browser is too old to load the sample data.'));
      return;
    }
    fetch(withCacheBust(MOCK_FILE))
      .then(function (r) {
        if (!r.ok) throw new Error('Could not load ' + MOCK_FILE + ' (HTTP ' + r.status + ').');
        return r.json();
      })
      .then(function (data) { return checkPayload(data); })
      .then(onSuccess)
      ['catch'](function (err) {
        // The overwhelmingly common cause here is opening index.html by
        // double-clicking it. Browsers block fetch on file:// URLs.
        if (window.location.protocol === 'file:') {
          onError(new Error('Sample data cannot load from a file:// URL. Run a local server instead, see README.md.'));
        } else {
          onError(err);
        }
      });
  }

  var jsonpSeq = 0;

  /**
   * The safety net. If the normal request is blocked, injecting a <script>
   * tag still works, because the response comes back as JavaScript rather
   * than as data the browser has to apply CORS rules to.
   */
  function loadViaJsonp(onSuccess, onError) {
    if (!CONFIG.API_URL) {
      onError(new Error('No API_URL is set in config.js.'));
      return;
    }

    jsonpSeq++;
    var name = '__holJsonp' + jsonpSeq;
    var script = document.createElement('script');
    var finished = false;

    function cleanUp() {
      if (finished) return true;
      finished = true;
      clearTimeout(timer);
      try { delete window[name]; } catch (e) { window[name] = undefined; }
      detach(script);
      return false;
    }

    var timer = setTimeout(function () {
      if (cleanUp()) return;
      onError(new Error('The scoreboard service did not respond.'));
    }, JSONP_TIMEOUT_MS);

    window[name] = function (data) {
      var checked = null;
      var err = null;
      try { checked = checkPayload(data); } catch (e) { err = e; }
      if (cleanUp()) return;
      if (err) onError(err); else onSuccess(checked);
    };

    script.onerror = function () {
      if (cleanUp()) return;
      onError(new Error('Could not reach the scoreboard service.'));
    };

    script.src = withCacheBust(CONFIG.API_URL, 'callback=' + name);
    document.head.appendChild(script);
  }

  /**
   * Normal path: a plain GET, no headers, cache-busted.
   *
   * Do not add a headers object, a Content-Type, or mode:'no-cors' here.
   * The /exec URL 302-redirects to script.googleusercontent.com and it is
   * that redirect which carries the CORS header. Any custom header turns the
   * request into a preflighted one, which Apps Script cannot answer.
   */
  function loadFromApi(onSuccess, onError) {
    var settled = false;
    var timeoutId = null;

    function succeed(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      onSuccess(data);
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      onError(err);
    }

    function fallbackToJsonp(originalErr) {
      if (settled) return;
      loadViaJsonp(succeed, function (jsonpErr) {
        fail(originalErr || jsonpErr);
      });
    }

    timeoutId = setTimeout(function () {
      fallbackToJsonp(new Error('The scoreboard service did not respond in time.'));
    }, FETCH_TIMEOUT_MS);

    if (typeof fetch !== 'function') {
      fallbackToJsonp(null);
      return;
    }

    fetch(withCacheBust(CONFIG.API_URL))
      .then(function (r) {
        if (!r.ok) throw new Error('The scoreboard service returned HTTP ' + r.status + '.');
        return r.json();
      })
      .then(function (data) {
        // Anything thrown from here on is a rendering bug, not a network
        // problem, so succeed() latches first and the catch below no-ops.
        succeed(checkPayload(data));
      })
      ['catch'](function (err) {
        if (settled) {
          if (window.console) console.error('Leaderboard render error:', err);
          return;
        }
        // The far end answered and told us what is wrong. Report it as-is
        // rather than asking the same question again down a second route.
        if (err && err.fromServer) {
          fail(err);
          return;
        }
        fallbackToJsonp(err);
      });
  }

  function loadData(onSuccess, onError) {
    if (MOCK_FILE) loadMock(onSuccess, onError);
    else loadFromApi(onSuccess, onError);
  }

  /* ================================================================
     STATE
     ================================================================ */

  var lastData = null;          // last payload that rendered successfully
  var prevRanking = null;       // the poll before that, for momentum arrows
  var crossedMilestones = {};
  var firstLoad = true;
  var eventCompleteCelebrated = false;
  var cardEls = {};             // house name -> its .house-card element

  /* ================================================================
     PER-GAME COPY
     One pool, used for the plain sentence shown on a game that has not
     started. The rotating ticker that used to sit under the standings
     was removed: a filled rounded block of centred bold text reads as a
     button, and text that rewrites itself every six seconds competes
     with the scores for attention.
     ================================================================ */

  var GAME_TEMPLATES = {
    not_started: [
      "{game} hasn't kicked off yet, check back soon",
      "Scoreboard's empty for {game}. Game on soon!",
      "{game} is up next. Stay tuned",
      "No scores yet for {game}, first points coming soon",
      "{game} hasn't started. Who's got this one?",
      "Warm-ups only for now. {game} starts soon"
    ]
  };

  /* ================================================================
     DERIVED STATE
     ================================================================ */

  function isEventComplete(data) {
    return data.totalGames > 0 && data.gamesCompleted === data.totalGames;
  }

  function rankingHasPoints(ranking) {
    if (!ranking) return false;
    for (var i = 0; i < ranking.length; i++) {
      if (ranking[i].total > 0) return true;
    }
    return false;
  }

  function hasAnyPoints(data) {
    return rankingHasPoints(data.ranking);
  }

  function isScored(v) {
    return v !== null && typeof v !== 'undefined';
  }

  /* ---------------- SCALE-AWARE THRESHOLDS ----------------
     Nothing about the scoring is fixed. Admins type points in freely, and a
     team league game may be worth 1000 while a solo game is worth 5. So the
     two thresholds that used to be hard numbers are worked out from the
     actual data instead, unless config.js overrides them with a number. */

  /**
   * The gap at or under which 1st and 2nd count as a nail-biter.
   * 5% of the leader's total reads as "neck and neck" whether the leader is
   * on 40 points or 12,000. Never below 1, so it still means something in the
   * opening rounds.
   */
  function closeRaceGap(data) {
    if (typeof CONFIG.CLOSE_RACE_GAP === 'number') return CONFIG.CLOSE_RACE_GAP;
    var leader = (data.ranking && data.ranking.length) ? data.ranking[0].total : 0;
    return Math.max(1, Math.round(leader * 0.05));
  }

  /** Rounds up to the nearest 1, 2 or 5 followed by zeros: 10, 25, 50, 100... */
  function niceStep(value) {
    if (!(value > 0)) return 0;
    var mag = Math.pow(10, Math.floor(Math.log(value) / Math.LN10));
    var norm = value / mag;
    var snapped = (norm <= 1) ? 1 : (norm <= 2) ? 2 : (norm <= 2.5) ? 2.5 : (norm <= 5) ? 5 : 10;
    return Math.max(1, Math.round(snapped * mag));
  }

  /**
   * Interval between milestone celebrations. Aims for about four across the
   * event. Prefers the Max Points column, which is the only stable measure of
   * how big the event is; falls back to projecting from the current leader.
   * Returns 0 when there is nothing to go on, which disables milestones.
   */
  function milestoneStep(data) {
    if (typeof CONFIG.MILESTONE_STEP === 'number') return CONFIG.MILESTONE_STEP;

    var basis = data.totalMaxPoints;
    if (!(basis > 0)) {
      // No Max Points filled in. Estimate the final total from where the
      // leader is now and how much of the event has been played.
      var leader = (data.ranking && data.ranking.length) ? data.ranking[0].total : 0;
      if (!(leader > 0)) return 0;
      var played = data.gamesCompleted || 1;
      var total = data.totalGames || played;
      basis = leader * (total / played);
    }
    return niceStep(basis / 4);
  }

  function gameAllFilled(g, houseNames) {
    for (var i = 0; i < houseNames.length; i++) {
      if (!isScored(g.scores[houseNames[i]])) return false;
    }
    return true;
  }

  function gameHasStarted(g, houseNames) {
    for (var i = 0; i < houseNames.length; i++) {
      if (isScored(g.scores[houseNames[i]])) return true;
    }
    return false;
  }

  /* ================================================================
     CONFETTI, SCREEN FLASH, BANNER
     ================================================================ */

  function spawnConfettiPieces(color, count, spreadSec) {
    var layer = byId('confetti-layer');
    if (!layer) return;
    // Forge accents: Vivid Violet and Deep Aubergine, plus every house colour.
    var colors = [color, '#7C4DCC', '#2A1849', '#E4A7F3'].concat(houseColors());
    for (var i = 0; i < count; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = (Math.random() * 100) + 'vw';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = (2.5 + Math.random() * 2.5) + 's';
      piece.style.animationDelay = (Math.random() * (spreadSec || 0.6)) + 's';
      layer.appendChild(piece);
      (function (p) { setTimeout(function () { detach(p); }, 6000); })(piece);
    }
  }

  /** Mode 1: a single burst. */
  function launchConfetti(color, big) {
    spawnConfettiPieces(color, big ? 200 : 80, big ? 1.2 : 0.6);
  }

  /** Mode 2: timed waves for a fixed number of milliseconds. */
  function launchConfettiFor(color, totalMs) {
    var elapsed = 0;
    var waveMs = 600;
    spawnConfettiPieces(color, 45, 0.5);
    var timer = setInterval(function () {
      elapsed += waveMs;
      spawnConfettiPieces(color, 40, 0.5);
      if (elapsed >= totalMs) clearInterval(timer);
    }, waveMs);
  }

  /** Mode 3: never-ending, for the finale. */
  var confettiForeverTimer = null;
  function launchConfettiForever(color) {
    if (confettiForeverTimer) clearInterval(confettiForeverTimer);
    spawnConfettiPieces(color, 45, 0.5);
    confettiForeverTimer = setInterval(function () {
      spawnConfettiPieces(color, 40, 0.5);
    }, 600);
  }

  function triggerScreenFlash(color) {
    var el = byId('screen-flash');
    if (!el) return;
    el.style.setProperty('--flash-color', color);
    el.classList.remove('flash-active');
    void el.offsetWidth;
    el.classList.add('flash-active');
  }

  function showBanner(text, duration, color) {
    var el = byId('big-banner');
    if (!el) return;
    el.style.setProperty('--banner-color', color || 'var(--accent)');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, duration || 3200);
  }

  /** Double-click the Mesa logo. Fires a celebration on demand, on stage. */
  function testCelebration() {
    var leader = lastData && lastData.ranking && lastData.ranking[0];
    var color = leader ? getMeta(leader.name).color : '#7C4DCC';
    var complete = !!(lastData && isEventComplete(lastData));

    if (complete) launchConfettiForever(color);
    else launchConfettiFor(color, 5000);

    triggerScreenFlash(color);

    var text;
    if (!leader) {
      text = '🎉 Scores are in!';
    } else if (complete) {
      text = '🏆 ' + leader.name + ' WINS THE HOUSE OLYMPICS!';
    } else {
      text = '🎉 ' + leader.name + ' is leading with ' + leader.total + ' points!';
    }
    showBanner(text, 6000, color);

    if (leader && lastData.ranking.length > 1) {
      queueClash(complete ? 'champion' : 'lead', lastData.ranking, leader.name);
    }
  }

  /* ================================================================
     CLASH CUTSCENE
     Six themes, each with its own loser animations, tag words and
     headline pools. Everything runs off a queue so two triggers
     arriving in the same poll can never overlap on screen.
     ================================================================ */

  var CLASH_DURATION = 5500;
  var CLASH_GAP = 500;
  var clashQueue = [];
  var clashPlaying = false;

  var CLASH_THEMES = [
    {
      id: 'bounceOff',
      tagStyle: 'ko',
      loserKeyframes: ['loserRubberBounce', 'loserBigBounceSpin', 'loserSlingshotYeet', 'loserBoingBoing'],
      headlines: {
        lead: ['{hero} BOUNCES INTO THE LEAD!', '{hero} KNOCKS EVERYONE OFF BALANCE!', '{hero} TAKES OVER FIRST PLACE!'],
        milestone: ['{hero} SMASHES {extra} PTS!', '{hero} BOUNCES PAST {extra} POINTS!'],
        champion: ['{hero} BOUNCES ALL THE WAY TO THE TITLE!', '{hero} WINS IT ALL!']
      }
    },
    {
      id: 'crySoak',
      tagStyle: 'cry',
      loserKeyframes: ['loserCrySoak'],
      headlines: {
        lead: ['{hero} HAS EVERYONE IN TEARS!'],
        milestone: ['{hero} CRUSHES {extra} POINTS!'],
        champion: ["{hero} WINS IT ALL, EVERYONE'S CRYING!"]
      }
    },
    {
      id: 'windSweep',
      tagStyle: 'wind',
      loserKeyframes: ['loserWindSweep'],
      headlines: {
        lead: ['{hero} SWEEPS THE COMPETITION AWAY!', 'A {hero} STORM TAKES THE LEAD!', '{hero} BLOWS PAST EVERYONE!'],
        milestone: ['{hero} STORMS TO {extra} PTS!', '{hero} GUSTS PAST {extra} POINTS!'],
        champion: ['{hero} SWEEPS THE WHOLE EVENT!']
      }
    },
    {
      id: 'rocketBlast',
      tagStyle: 'blast',
      loserKeyframes: ['loserRocketBlast'],
      headlines: {
        lead: ['{hero} BLASTS INTO THE LEAD!'],
        milestone: [],
        champion: []
      }
    },
    {
      id: 'flattenPancake',
      tagStyle: 'flat',
      loserKeyframes: ['loserFlattenPancake'],
      headlines: {
        lead: [],
        milestone: ['{hero} ROLLS PAST {extra} PTS!'],
        champion: []
      }
    },
    {
      id: 'dizzyStagger',
      tagStyle: 'dizzy',
      loserKeyframes: ['loserDizzyStagger'],
      headlines: {
        lead: ['{hero} HAS EVERYONE SEEING STARS!', '{hero} LEAVES THE COMPETITION DIZZY!'],
        milestone: [],
        champion: ['{hero} LEAVES EVERYONE DIZZY WITH THE WIN!', '{hero} SPINS TO THE TITLE!']
      }
    }
  ];

  var CLASH_TAGS = {
    ko: ['BONK!', 'OOF!', 'YEET!', 'WHOOSH!', 'POW!', 'WHAM!', 'ZOINK!', 'KAPOW!', 'THUD!', 'SPLAT!'],
    cry: ['😭', 'NOOO!', 'SO CLOSE...', 'WHY...', 'NOT FAIR!'],
    wind: ['WHOOSH!', 'GONE!', 'BYE!', 'SWEPT!'],
    blast: ['BOOM!', 'KABOOM!', 'BLAST!', 'ZAP!'],
    flat: ['SPLAT!', 'FLAT!', 'SQUISH!', 'CRUNCH!'],
    dizzy: ['WHOA...', 'DIZZY!', 'SPINNING!', 'WOOZY!']
  };

  var CLASH_SLOT_VECTORS = [
    { dx: '-34vw', dy: '-16vh', rot: '-30deg' },
    { dx: '34vw', dy: '-16vh', rot: '30deg' },
    { dx: '0vw', dy: '28vh', rot: '15deg' }
  ];

  function queueClash(reason, ranking, heroName, extra) {
    if (!ranking || ranking.length < 2) return;
    clashQueue.push({ reason: reason, ranking: ranking.slice(), hero: heroName, extra: extra });
    processClashQueue();
  }

  function processClashQueue() {
    if (clashPlaying || !clashQueue.length) return;
    clashPlaying = true;
    var item = clashQueue.shift();
    playClash(item.reason, item.ranking, item.hero, item.extra);
    setTimeout(function () {
      clashPlaying = false;
      processClashQueue();
    }, CLASH_DURATION + CLASH_GAP);
  }

  function clashCrestHtml(name) {
    var meta = getMeta(name);
    if (meta.logo) {
      return '<img src="' + escapeHtml(meta.logo) + '" alt="' + escapeHtml(name) + '">';
    }
    return '<div class="fallback-badge" style="width:100%;height:100px;border-radius:16px;">' +
      escapeHtml(initials(name)) + '</div>';
  }

  function playClash(reason, ranking, heroName, extra) {
    var overlay = byId('clash-overlay');
    var arena = byId('clash-arena');
    var headlineEl = byId('clash-headline');
    if (!overlay || !arena || !headlineEl) return;
    arena.innerHTML = '';

    var hero = findBy(ranking, 'name', heroName) || ranking[0];
    var rest = [];
    each(ranking, function (h) {
      if (h.name !== hero.name && rest.length < 3) rest.push(h);
    });

    var theme = CLASH_THEMES[Math.floor(Math.random() * CLASH_THEMES.length)];
    var templates;
    if (theme.headlines[reason] && theme.headlines[reason].length) {
      templates = theme.headlines[reason];
    } else if (theme.headlines.lead && theme.headlines.lead.length) {
      templates = theme.headlines.lead;
    } else {
      templates = ['{hero} TAKES THE LEAD!'];
    }

    var headline = pick(templates)
      .replace('{hero}', String(hero.name).toUpperCase())
      .replace('{extra}', (extra !== null && typeof extra !== 'undefined') ? extra : '');
    var tagWords = CLASH_TAGS[theme.tagStyle] || CLASH_TAGS.ko;

    var winnerEl = document.createElement('div');
    winnerEl.className = 'clash-crest clash-winner';
    winnerEl.innerHTML = clashCrestHtml(hero.name);
    arena.appendChild(winnerEl);

    each(rest, function (h, i) {
      var el = document.createElement('div');
      el.className = 'clash-crest clash-loser';
      var vec = CLASH_SLOT_VECTORS[i] || CLASH_SLOT_VECTORS[2];
      el.style.setProperty('--dx', vec.dx);
      el.style.setProperty('--dy', vec.dy);
      el.style.setProperty('--rot', vec.rot);
      el.style.animationName = pick(theme.loserKeyframes);

      var decor = '';
      if (theme.id === 'dizzyStagger') {
        decor = '<div class="dizzy-stars"><span>★</span><span>★</span><span>★</span></div>';
      } else if (theme.id === 'crySoak') {
        decor = '<div class="tears"><span>💧</span><span>💧</span><span>💧</span></div>';
      } else if (theme.id === 'rocketBlast') {
        decor = '<div class="blast-ring"></div>';
      }

      el.innerHTML = clashCrestHtml(h.name) +
        '<div class="ko-tag tag-' + theme.tagStyle + '">' + escapeHtml(pick(tagWords)) + '</div>' +
        decor;
      arena.appendChild(el);
    });

    headlineEl.textContent = headline;

    overlay.classList.remove('show');
    void overlay.offsetWidth;
    overlay.classList.add('show');

    setTimeout(function () { overlay.classList.remove('show'); }, CLASH_DURATION);
  }

  /* ================================================================
     CELEBRATION TRIGGERS
     Off by default. See AUTO_CELEBRATIONS in config.js for why.
     ================================================================ */

  function checkCelebrations(data) {
    var justCompleted = isEventComplete(data) && !eventCompleteCelebrated;
    var step = milestoneStep(data);

    if (!justCompleted) {
      each(data.ranking, function (h) {
        var already = crossedMilestones[h.name] || 0;
        var currentStep = step ? Math.floor(h.total / step) * step : 0;
        if (currentStep > already && currentStep > 0) {
          crossedMilestones[h.name] = currentStep;
          if (!firstLoad) {
            launchConfetti(getMeta(h.name).color);
            showBanner(h.name + ' hits ' + currentStep + ' points! 🎉', 3200, getMeta(h.name).color);
            queueClash('milestone', data.ranking, h.name, currentStep);
          }
        }
      });

      if (prevRanking && !firstLoad && rankingHasPoints(prevRanking)) {
        var newLeader = data.ranking[0];
        var oldLeader = prevRanking[0];
        if (newLeader && oldLeader && newLeader.name !== oldLeader.name) {
          var leadColor = getMeta(newLeader.name).color;
          launchConfettiFor(leadColor, 5000);
          triggerScreenFlash(leadColor);
          showBanner('👑 ' + newLeader.name + ' TAKES THE LEAD!', 6000, leadColor);
          queueClash('lead', data.ranking, newLeader.name);
        }
      }
    } else {
      // Seed the milestone marks silently, so finishing the event does not
      // also fire four milestone animations behind the champion cutscene.
      each(data.ranking, function (h) {
        var currentStep = step ? Math.floor(h.total / step) * step : 0;
        if (currentStep > (crossedMilestones[h.name] || 0)) {
          crossedMilestones[h.name] = currentStep;
        }
      });
    }

    if (justCompleted) {
      eventCompleteCelebrated = true;
      if (!firstLoad) {
        var champion = data.ranking[0];
        var championColor = getMeta(champion.name).color;
        launchConfettiForever(championColor);
        triggerScreenFlash(championColor);
        showBanner('🏆 ' + champion.name + ' WINS THE HOUSE OLYMPICS!', 6000, championColor);
        queueClash('champion', data.ranking, champion.name);
      }
    }
  }

  /* ================================================================
     RENDER: RANKING CARDS
     ================================================================ */

  function animateNumber(el, from, to, duration) {
    // Token guard: two polls arriving close together used to leave two
    // requestAnimationFrame loops fighting over the same element, which
    // showed up as the number visibly stuttering.
    el.__animToken = (el.__animToken || 0) + 1;
    var token = el.__animToken;
    var start = null;

    function step(timestamp) {
      if (el.__animToken !== token) return;
      if (!start) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = to;
    }
    requestAnimationFrame(step);
  }

  function ensureSparkles(el, active) {
    var existing = el.querySelectorAll('.sparkle');
    if (!active) {
      each(existing, function (s) { detach(s); });
      return;
    }
    if (existing.length) return;
    for (var i = 0; i < 6; i++) {
      var s = document.createElement('span');
      s.className = 'sparkle';
      s.style.left = (5 + Math.random() * 88) + '%';
      s.style.top = (12 + Math.random() * 76) + '%';
      s.style.animationDelay = (Math.random() * 1.9) + 's';
      el.appendChild(s);
    }
  }

  function renderRanking(data) {
    var container = byId('ranking');

    // FLIP, part one: where is every card right now.
    var oldRects = {};
    each(container.querySelectorAll('.house-card'), function (el) {
      oldRects[el.getAttribute('data-house')] = el.getBoundingClientRect();
    });

    // Race bars are sized against the current leader, not the theoretical
    // maximum, so the bars actually move early in the event.
    var denom = Math.max(data.ranking.length ? data.ranking[0].total : 1, 1);
    var complete = isEventComplete(data);
    var notStarted = !hasAnyPoints(data);

    // Drop cards for houses that have vanished from the sheet.
    var live = {};
    each(data.ranking, function (h) { live[h.name] = true; });
    for (var name in cardEls) {
      if (Object.prototype.hasOwnProperty.call(cardEls, name) && !live[name]) {
        detach(cardEls[name]);
        delete cardEls[name];
      }
    }

    each(data.ranking, function (h) {
      var meta = getMeta(h.name);
      var el = cardEls[h.name];

      if (!el) {
        el = document.createElement('div');
        el.className = 'house-card';
        el.setAttribute('data-house', h.name);
        el.innerHTML =
          '<div class="rank-num"></div>' +
          '<div class="house-badge"></div>' +
          '<div class="house-main">' +
            '<div class="name-momentum-row"><span class="hname"></span><span class="momentum"></span></div>' +
            '<div class="house-sub"></div>' +
          '</div>' +
          '<div class="house-points"><span class="pval"></span></div>';
        cardEls[h.name] = el;
      }
      // Re-appending in ranking order is what reorders the list.
      container.appendChild(el);

      el.style.setProperty('--house-color', meta.color);
      setClass(el, 'leader', h.rank === 1 && !notStarted);

      // Pre-game: a bullet rather than a rank number, and no leader.
      el.querySelector('.rank-num').textContent = notStarted ? '•' : String(h.rank);

      var badge = el.querySelector('.house-badge');
      var wantCrest = meta.logo ? meta.logo : ('fallback:' + h.name);
      if (badge.getAttribute('data-crest') !== wantCrest) {
        badge.setAttribute('data-crest', wantCrest);
        badge.innerHTML = crestHtml(h.name);
      }

      el.querySelector('.hname').textContent = h.name;

      // Champion chip on the #1 card once every game is scored. It sits
      // inside the name row so it can never be clipped by the card.
      var existingBadge = el.querySelector('.champion-badge');
      if (h.rank === 1 && complete) {
        if (!existingBadge) {
          var chip = document.createElement('span');
          chip.className = 'champion-badge';
          chip.textContent = 'Champion';
          el.querySelector('.name-momentum-row').appendChild(chip);
        }
      } else if (existingBadge) {
        detach(existingBadge);
      }

      ensureSparkles(el, h.rank === 1 && !notStarted);

      // Points count up rather than snapping, with the pop flash.
      var pvalEl = el.querySelector('.pval');
      var stored = el.getAttribute('data-total');
      var prevTotal = (stored === null) ? h.total : parseInt(stored, 10);
      if (prevTotal !== h.total) {
        animateNumber(pvalEl, prevTotal, h.total, 900);
        pvalEl.classList.remove('pop');
        void pvalEl.offsetWidth;
        pvalEl.classList.add('pop');
      } else {
        pvalEl.textContent = h.total;
      }
      el.setAttribute('data-total', h.total);

      // Momentum arrows versus the previous poll. Silent before the event.
      var momentumEl = el.querySelector('.momentum');
      var prev = (prevRanking && rankingHasPoints(prevRanking))
        ? findBy(prevRanking, 'name', h.name)
        : null;
      if (!prev || notStarted) {
        momentumEl.textContent = '';
        momentumEl.className = 'momentum same';
      } else if (prev.rank > h.rank) {
        momentumEl.textContent = '▲';
        momentumEl.className = 'momentum up';
      } else if (prev.rank < h.rank) {
        momentumEl.textContent = '▼';
        momentumEl.className = 'momentum down';
      } else {
        momentumEl.textContent = '';
        momentumEl.className = 'momentum same';
      }

      // The bar is the card's bottom edge at every width, drawn by
      // .house-card::after from this custom property.
      var pct = notStarted ? 0 : Math.max(3, Math.round((h.total / denom) * 100));
      el.style.setProperty('--bar-pct', pct + '%');

      // The question the room is actually asking. Silent before the event,
      // because "0 behind" for everyone is noise.
      var subEl = el.querySelector('.house-sub');
      if (notStarted) {
        subEl.textContent = '';
      } else if (h.rank === 1) {
        subEl.textContent = complete ? 'Champion' : 'Leading';
      } else {
        var behind = data.ranking[0].total - h.total;
        subEl.textContent = behind + ' behind';
      }
    });

    // FLIP, part two: slide each card from where it was to where it is.
    each(container.querySelectorAll('.house-card'), function (el) {
      var oldRect = oldRects[el.getAttribute('data-house')];
      if (!oldRect || !el.animate) return;
      var newRect = el.getBoundingClientRect();
      var deltaY = oldRect.top - newRect.top;
      if (deltaY) {
        el.animate(
          [{ transform: 'translateY(' + deltaY + 'px)' }, { transform: 'translateY(0)' }],
          { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
      }
    });
  }

  /* ================================================================
     RENDER: PODIUM
     Replaces the ranking list once every game is scored.
     ================================================================ */

  var podiumRendered = null;

  function renderPodium(data) {
    var wrap = byId('podium');
    var rankingEl = byId('ranking');
    var complete = isEventComplete(data);

    if (!complete) {
      wrap.style.display = 'none';
      rankingEl.style.display = '';
      podiumRendered = null;
      return;
    }

    rankingEl.style.display = 'none';
    wrap.style.display = '';

    // Redraw only when the standings actually change, so a late score
    // correction still updates the podium but a routine poll does not
    // replay the rise animation every 20 seconds.
    var signature = data.ranking.map(function (h) { return h.name + ':' + h.total; }).join('|');
    if (podiumRendered === signature) return;
    podiumRendered = signature;

    var top3 = data.ranking.slice(0, 3);
    var rest = data.ranking.slice(3);
    var order = [top3[1], top3[0], top3[2]];   // 2nd, 1st, 3rd

    var cols = order.map(function (h) {
      if (!h) return '';
      var meta = getMeta(h.name);
      return (
        '<div class="podium-col rank-' + h.rank + '" style="--house-color:' + escapeHtml(meta.color) + '">' +
          '<div class="podium-crest">' + crestHtml(h.name) + '</div>' +
          '<div class="podium-name">' + escapeHtml(h.name) + '</div>' +
          '<div class="podium-points">' + h.total + ' pts</div>' +
          '<div class="podium-block">' + h.rank + '</div>' +
        '</div>'
      );
    }).join('');

    var restLine = rest.length
      ? '<div class="podium-rest">' + rest.map(function (h, i) {
          return '#' + (i + 4) + ' ' + escapeHtml(h.name) + ' — ' + h.total + ' pts';
        }).join(' &nbsp;&middot;&nbsp; ') + '</div>'
      : '';

    wrap.innerHTML =
      '<div class="podium-title">🏆 CHAMPIONS 🏆</div>' +
      '<div class="podium-stage">' + cols + '</div>' +
      restLine;
  }

  /* ================================================================
     RENDER: CALLOUT, BREAKDOWN
     ================================================================ */

  function renderCallout(data) {
    var el = byId('callout');
    if (isEventComplete(data) || data.ranking.length < 2) {
      el.classList.remove('show');
      return;
    }
    var gap = data.ranking[0].total - data.ranking[1].total;
    if (gap <= closeRaceGap(data) && data.gamesCompleted > 0) {
      el.textContent = '🔥 Nail-biter! Only ' + gap + ' point' + (gap === 1 ? '' : 's') +
        ' between ' + data.ranking[0].name + ' and ' + data.ranking[1].name + '!';
      el.classList.add('show');
    } else {
      el.classList.remove('show');
    }
  }

  function renderBreakdown(data) {
    var head = byId('breakdown-head');
    var body = byId('breakdown-body');

    // The house colour is carried by a dot, not by the text. As text,
    // Vikings yellow is 1.6:1 on this surface and Gladiators green 2.9:1 -
    // both illegible. Colour identifies, the label hierarchy stays readable.
    head.innerHTML = '<th>Game</th>' + data.houseNames.map(function (name) {
      return '<th><span class="col-dot" style="background:' +
        escapeHtml(getMeta(name).color) + '"></span>' + escapeHtml(name) + '</th>';
    }).join('') + '<th>Max</th><th>Winner</th>';

    body.innerHTML = data.games.map(function (g) {
      var allFilled = gameAllFilled(g, data.houseNames);

      // A winner only exists once every house has been scored, otherwise the
      // "winner" is just whoever happened to be entered first.
      var winners = [];
      if (allFilled) {
        var best = -Infinity;
        each(data.houseNames, function (name) {
          var v = g.scores[name];
          if (v > best) { best = v; winners = [name]; }
          else if (v === best) { winners.push(name); }
        });
      }

      var cells = data.houseNames.map(function (name) {
        var v = g.scores[name];
        if (!isScored(v)) return '<td class="cell-blank">—</td>';
        var isSoleWinner = allFilled && winners.length === 1 && winners[0] === name;
        return isSoleWinner
          ? '<td class="cell-winner" style="--win-color:' + escapeHtml(getMeta(name).color) + '">' + v + '</td>'
          : '<td>' + v + '</td>';
      }).join('');

      var maxCell = isScored(g.maxPoints)
        ? '<td>' + g.maxPoints + '</td>'
        : '<td class="cell-blank">—</td>';

      var winnerCell;
      if (!allFilled) {
        winnerCell = '<td class="cell-blank">—</td>';
      } else if (winners.length === 1) {
        winnerCell = '<td class="winner-cell"><span class="col-dot" style="background:' +
          escapeHtml(getMeta(winners[0]).color) + '"></span>' + escapeHtml(winners[0]) + '</td>';
      } else {
        winnerCell = '<td class="winner-cell tie">Tie: ' + escapeHtml(winners.join(' / ')) + '</td>';
      }

      return '<tr><td>' + escapeHtml(g.name) + '</td>' + cells + maxCell + winnerCell + '</tr>';
    }).join('');
  }

  /* ================================================================
     CONNECTION STATUS
     Lives in the corner where the timestamp already sat. Calm on
     purpose: one failed poll changes nothing visible, because a
     single dropped request during an event is normal and not worth
     putting on a screen in front of 120 people.
     ================================================================ */

  var consecutiveFailures = 0;
  var lastGoodStamp = null;    // Date of the last payload that rendered
  var lastError = null;

  function formatTime(d) {
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleTimeString();
  }

  /**
   * Apple does not print a clock time to mean "freshness" - Mail says
   * "Updated Just Now", Weather says "Updated 3 minutes ago". A clock time
   * makes the reader do arithmetic: it is 17:12, the label says 17:07, so
   * that is five minutes. Relative time removes the subtraction, which is
   * the whole point of the label.
   *
   * It also degrades usefully. "Updated just now" is reassuring at a glance,
   * and "Updated 4 min ago" is a problem you can see before the warning
   * state even fires.
   */
  function relativeTime(then) {
    if (!then || isNaN(then.getTime())) return '';
    // Venue laptop clocks drift against Google's servers, and generatedAt is
    // server time. Never render a negative age as "in 3 minutes".
    var secs = Math.max(0, Math.round((new Date().getTime() - then.getTime()) / 1000));
    if (secs < 45) return 'just now';
    var mins = Math.round(secs / 60);
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.round(mins / 60);
    return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  }

  function renderConnection() {
    var dot = byId('conn-dot');
    var el = byId('updated');
    if (!dot || !el) return;

    dot.className = 'conn-dot';
    el.classList.remove('conn-warn-text');

    var ago = relativeTime(lastGoodStamp);
    // The exact clock time still exists for whoever is running the event,
    // it just lives in the tooltip instead of on a screen for 120 people.
    var exact = lastGoodStamp ? ('Last successful update at ' + formatTime(lastGoodStamp)) : '';
    var why = lastError ? String(lastError.message || lastError) : '';

    // One failed poll changes nothing on screen. A single dropped request
    // during an event is normal and not worth putting in front of 120 people.
    // Two in a row is the threshold for saying anything at all.
    //
    // This check comes before the mock branch on purpose: a rehearsal that
    // has quietly stopped loading should say so rather than keep claiming
    // everything is fine.
    if (consecutiveFailures >= 2) {
      dot.classList.add('conn-warn');
      el.classList.add('conn-warn-text');
      // "Last updated" rather than "Updated": the word "last" is what tells
      // you this is the most recent success, not the current state.
      el.textContent = lastGoodStamp
        ? ('Last updated ' + ago)
        : 'Can’t reach the scoreboard';
      el.title = [exact, why].filter(Boolean).join(' — ');
      return;
    }

    if (MOCK_FILE) {
      dot.classList.add('conn-mock');
      el.textContent = (MOCK_REASON === 'no-url')
        ? 'Demo data · API_URL not set'
        : 'Demo data · not live';
      el.title = 'Showing the bundled sample scores from ' + MOCK_FILE;
      return;
    }

    if (!lastGoodStamp) {
      el.textContent = 'Loading…';
      el.title = why;
      return;
    }

    dot.classList.add('conn-live');
    el.textContent = 'Updated ' + ago;
    el.title = exact;
  }

  /* ================================================================
     PER-GAME NAVIGATION AND VIEW
     ================================================================ */

  var currentView = 'overview';    // 'overview' or a game index
  var sideNavOpen = false;
  var gameRendered = null;

  function toggleSideNav(forceState) {
    sideNavOpen = (typeof forceState === 'boolean') ? forceState : !sideNavOpen;
    setClass(byId('side-nav'), 'show', sideNavOpen);
    setClass(byId('side-nav-tab'), 'nav-open', sideNavOpen);
    byId('side-nav-tab').setAttribute('aria-expanded', sideNavOpen ? 'true' : 'false');
  }

  function showOverview() {
    currentView = 'overview';
    gameRendered = null;
    byId('overview-view').style.display = 'block';
    byId('game-view').style.display = 'none';
    toggleSideNav(false);
    if (lastData) renderSideNav(lastData);
  }

  function showGame(i) {
    currentView = i;
    gameRendered = null;
    byId('overview-view').style.display = 'none';
    byId('game-view').style.display = 'block';
    toggleSideNav(false);
    if (lastData) {
      renderSideNav(lastData);
      renderGameView(lastData, i);
    }
  }

  function renderSideNav(data) {
    var nav = byId('side-nav');
    if (!data.games || !data.games.length) { nav.innerHTML = ''; return; }

    var items = '<button class="side-nav-item overview-item' +
      (currentView === 'overview' ? ' active' : '') +
      '" data-nav="overview">Home</button>';

    items += data.games.map(function (g, i) {
      var allFilled = gameAllFilled(g, data.houseNames);
      var started = gameHasStarted(g, data.houseNames);
      var dotClass = allFilled ? 'snl-complete' : (started ? 'snl-progress' : '');
      return '<button class="side-nav-item' + (currentView === i ? ' active' : '') +
        '" data-nav="' + i + '" title="' + escapeHtml(g.name) + '">' +
        '<span class="snl-dot ' + dotClass + '"></span>' +
        '<span class="snl">' + (i + 1) + '. ' + escapeHtml(g.name) + '</span></button>';
    }).join('');

    nav.innerHTML = items;
  }

  function renderGameView(data, i) {
    if (!data.games || i >= data.games.length) {
      // The game was deleted from the sheet while someone was looking at it.
      showOverview();
      return;
    }

    var g = data.games[i];
    var houseNames = data.houseNames;

    // Only rebuild when something actually changed. Re-writing the whole
    // view every 20s made a game screen left up on a TV visibly flicker.
    var signature = i + '|' + g.name + '|' + g.maxPoints + '|' + houseNames.map(function (n) {
      return n + '=' + g.scores[n];
    }).join(',');
    if (gameRendered === signature) return;
    gameRendered = signature;

    var started = gameHasStarted(g, houseNames);
    var allFilled = gameAllFilled(g, houseNames);
    var statusClass = !started ? 'gv-not-started' : (allFilled ? 'gv-complete' : 'gv-in-progress');
    var statusText = !started ? 'Not Started' : (allFilled ? 'Complete' : 'In Progress');
    var maxLabel = isScored(g.maxPoints) ? (g.maxPoints + ' pts max') : '';

    var bodyHtml;
    if (!started) {
      bodyHtml = '<div class="gv-pregame-box">' +
        escapeHtml(fill(pick(GAME_TEMPLATES.not_started), { game: g.name })) + '</div>';
    } else {
      var scored = [];
      var pending = [];
      each(houseNames, function (name) {
        var v = g.scores[name];
        if (!isScored(v)) pending.push(name);
        else scored.push({ name: name, score: v });
      });
      scored.sort(function (a, b) { return b.score - a.score; });

      var denom = Math.max(scored.length ? scored[0].score : 0, 1);

      var scoredRows = scored.map(function (h, idx) {
        var meta = getMeta(h.name);
        var pct = Math.max(0, Math.min(100, (h.score / denom) * 100));
        var badgeHtml = (idx === 0 && allFilled)
          ? '<span class="champion-badge">Winner</span>' : '';
        var sub = (idx === 0)
          ? (allFilled ? 'Won this game' : 'Top so far')
          : ((scored[0].score - h.score) + ' behind');
        return (
          '<div class="house-card' + (idx === 0 ? ' leader' : '') +
            '" style="--house-color:' + escapeHtml(meta.color) + ';--bar-pct:' + pct + '%">' +
            '<div class="rank-num">' + (idx + 1) + '</div>' +
            '<div class="house-badge">' + crestHtml(h.name) + '</div>' +
            '<div class="house-main">' +
              '<div class="name-momentum-row"><span class="hname">' + escapeHtml(h.name) + '</span>' +
                badgeHtml + '</div>' +
              '<div class="house-sub">' + escapeHtml(sub) + '</div>' +
            '</div>' +
            '<div class="house-points"><span class="pval">' + h.score + '</span></div>' +
          '</div>'
        );
      }).join('');

      // Houses with no score yet: dimmed, with a dash instead of a number.
      var pendingRows = pending.map(function (name) {
        var meta = getMeta(name);
        return (
          '<div class="house-card" style="--house-color:' + escapeHtml(meta.color) + ';opacity:0.55;">' +
            '<div class="rank-num">•</div>' +
            '<div class="house-badge">' + crestHtml(name) + '</div>' +
            '<div class="house-main">' +
              '<div class="name-momentum-row"><span class="hname">' + escapeHtml(name) + '</span></div>' +
              '<div class="house-sub">Not scored yet</div>' +
            '</div>' +
            '<div class="house-points"><span class="pval">—</span></div>' +
          '</div>'
        );
      }).join('');

      bodyHtml = '<div id="game-view-ranking">' + scoredRows + pendingRows + '</div>';
    }

    byId('game-view-hero').innerHTML =
      '<div class="gv-topbar">' +
        '<button class="gv-back" type="button" data-nav="overview">' +
          '<svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true">' +
            '<path d="M6 1L1 6l5 5" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          'Home' +
        '</button>' +
        '<span class="updated">' + escapeHtml(maxLabel) + '</span>' +
      '</div>' +
      '<div class="title-block">' +
        '<div class="title-flair">&#9733; &#9733; &#9733;</div>' +
        '<h1>' + escapeHtml(g.name) + '</h1>' +
        '<div class="title-underline"></div>' +
      '</div>' +
      '<div class="gv-status-row"><span class="gv-status-pill ' + statusClass + '">' + statusText + '</span></div>' +
      bodyHtml;
  }

  /* ================================================================
     REFRESH LOOP AND RECOVERY
     ================================================================ */

  // Retry ladder used after a failed poll. Once a poll succeeds we go
  // straight back to the normal interval.
  var BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];
  var refreshTimer = null;

  function scheduleNextRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    var delay;
    if (consecutiveFailures === 0) {
      delay = CONFIG.REFRESH_MS;
    } else {
      delay = BACKOFF_MS[Math.min(consecutiveFailures - 1, BACKOFF_MS.length - 1)];
    }
    refreshTimer = setTimeout(refresh, delay);
  }

  function render(data) {
    applyHouseMeta(data);

    if (CONFIG.AUTO_CELEBRATIONS) checkCelebrations(data);

    renderRanking(data);
    renderPodium(data);
    renderCallout(data);
    renderBreakdown(data);
    renderSideNav(data);
    if (typeof currentView === 'number') renderGameView(data, currentView);

    prevRanking = data.ranking;
    firstLoad = false;
  }

  function refresh() {
    loadData(
      function (data) {
        lastData = data;
        consecutiveFailures = 0;
        lastError = null;

        var stamp = new Date(data.generatedAt);
        lastGoodStamp = isNaN(stamp.getTime()) ? new Date() : stamp;

        render(data);
        renderConnection();
        scheduleNextRefresh();
      },
      function (err) {
        // The whole point of this branch: keep the last good scores on
        // screen. Nothing is cleared, nothing is blanked, we just note the
        // failure and try again sooner.
        consecutiveFailures++;
        lastError = err;
        if (window.console) {
          console.error('Leaderboard poll failed (' + consecutiveFailures + ' in a row):', err);
        }
        renderConnection();
        scheduleNextRefresh();
      }
    );
  }

  /* ================================================================
     WIRING AND START
     ================================================================ */

  function findNavTarget(node) {
    while (node && node !== document.body) {
      if (node.getAttribute && node.getAttribute('data-nav') !== null) return node;
      node = node.parentNode;
    }
    return null;
  }

  function init() {
    var title = CONFIG.EVENT_TITLE || 'Forge Olympics';
    byId('event-title').textContent = title;
    document.title = title;

    byId('side-nav-tab').addEventListener('click', function () { toggleSideNav(); });

    // Event delegation, so the buttons the side nav rebuilds every poll do
    // not need inline onclick attributes built by string concatenation.
    function handleNav(e) {
      var target = findNavTarget(e.target);
      if (!target) return;
      var nav = target.getAttribute('data-nav');
      if (nav === 'overview') showOverview();
      else showGame(parseInt(nav, 10));
    }
    byId('side-nav').addEventListener('click', handleNav);
    byId('game-view').addEventListener('click', handleNav);

    // A drawer you can only close with the control that opened it is a trap.
    // Escape and a click outside are what people already try.
    document.addEventListener('keydown', function (e) {
      if (sideNavOpen && (e.key === 'Escape' || e.keyCode === 27)) toggleSideNav(false);
    });
    document.addEventListener('click', function (e) {
      if (!sideNavOpen) return;
      var n = e.target;
      while (n) {
        if (n === byId('side-nav') || n === byId('side-nav-tab')) return;
        n = n.parentNode;
      }
      toggleSideNav(false);
    });

    byId('brand-mark').addEventListener('dblclick', testCelebration);
    byId('brand-mark').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
        e.preventDefault();
        testCelebration();
      }
    });

    // Coming back from a sleeping laptop lid or a backgrounded tab: pull
    // fresh scores immediately rather than waiting out the timer.
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) refresh();
      });
    }

    renderConnection();
    setInterval(renderConnection, 20000);
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
