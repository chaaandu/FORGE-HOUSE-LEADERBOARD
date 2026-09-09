/**
 * HOUSE OLYMPICS LEADERBOARD - client configuration
 *
 * This is the only file a non-developer should ever need to touch.
 * Edit it, save it, redeploy. There is no build step.
 *
 * Nothing secret goes in here. This file is downloaded by every browser that
 * opens the leaderboard, so treat everything below as public.
 */

var CONFIG = {

  // The Apps Script web app URL, ending in /exec.
  // Get it from: Apps Script editor > Deploy > New deployment > Web app.
  // Leave it blank to run on the bundled sample data instead of live scores.
  API_URL: 'https://script.google.com/macros/s/AKfycbzrv3Ryq9GUvXFBLieXT6aZkjSbRYka5WRbjnUamMZuEbFf0XrRDw-n1TjWSb1EktEdoA/exec',

  // The big heading on the page, and the browser tab title.
  EVENT_TITLE: 'Forge Olympics',

  // How often to pull fresh scores, in milliseconds. 20000 = 20 seconds.
  // Going much below 10000 is pointless, the API caches for 5 seconds anyway.
  REFRESH_MS: 20000,

  // When the "nail-biter" callout appears between 1st and 2nd place.
  //
  // 'auto' (recommended) scales with whatever the scores actually are, so it
  // works whether a game is worth 5 points or 1000, and whether some games
  // are team events and others are solo. It fires when the gap between 1st
  // and 2nd is within 5% of the leader's total, which reads as "genuinely
  // neck and neck" at any scale.
  //
  // Set a plain number instead to force a fixed gap, e.g. 50.
  CLOSE_RACE_GAP: 'auto',

  // Point interval that triggers a milestone celebration.
  // Only used when AUTO_CELEBRATIONS is on, so this is usually irrelevant.
  //
  // 'auto' picks a sensible round interval from the size of the event: it
  // aims for roughly four milestones across the whole thing, snapped to a
  // round number (10, 25, 50, 100, 250...). It works this out from the
  // Max Points column when that is filled in, and estimates from the current
  // scores when it is not.
  //
  // Set a plain number instead to force a fixed interval, e.g. 200.
  MILESTONE_STEP: 'auto',

  // Fire confetti and the clash cutscene automatically on lead changes and
  // milestones. OFF by default on purpose: if you paste in several games of
  // scores at once, this queues up a long unstoppable chain of animations.
  // Turn it on ONLY if scores are entered one game at a time during the event.
  // Double-clicking the Mesa logo works either way.
  AUTO_CELEBRATIONS: false,

  // Load the bundled mock.json instead of the live API. Handy for rehearsing
  // the screen with no network. You can also force this per-browser without
  // editing the file, by adding ?mock=1 to the URL.
  USE_MOCK: false,

  // The houses.
  //
  // "name" MUST match the sheet column header exactly - same spelling, same
  // spacing, same capitalisation. A house that appears in the sheet but is
  // missing from this list still shows up, as a grey circle with its first
  // two letters, and nothing else breaks.
  //
  // "color" is the crest's dominant hex colour. It drives the race bar, the
  // card glow, the podium block and the confetti.
  //
  // "logo" is a path relative to this folder. Drop the real crest PNGs into
  // public/assets/logos/ using these exact filenames, all lowercase, and no
  // code change is needed. Transparent backgrounds look best, especially in
  // the clash cutscene.
  HOUSES: [
    { name: 'Vikings',    color: '#F2BD0E', logo: 'assets/logos/vikings.png' },
    { name: 'Gladiators', color: '#40A261', logo: 'assets/logos/gladiators.png' },
    { name: 'Samurai',    color: '#1B3A6B', logo: 'assets/logos/samurai.png' },
    { name: 'Knights',    color: '#AB121B', logo: 'assets/logos/knights.png' }
  ]
};
