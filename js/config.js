// Tunable numbers in one place. Lengths are art pixels unless the name says otherwise.

export const SEED = 20261022;

// Art density: CSS px per art pixel. The art is drawn finely (about 2× srnk's density), so a
// phone shows 1 CSS px per art pixel (3 device px on a DPR-3 screen) and a desktop 2.
export const SCALE = Object.freeze({
  phoneMaxCss: 700, // viewport narrower than this counts as a phone
  phone: 1,
  desktop: 2,
  maxBoost: 2, // smaller (older, coarser) art may be shown up to twice the target density
});

// Physics constants below are for a box 120 art px wide; they scale with the real box.
export const KIT_DESIGN_BOX_W = 120;

export const KIT = Object.freeze({
  stepMs: 1000 / 60, // fixed physics step
  dropEverySteps: 54, // one item enters every ~0.9 s of simulated time
  spawnAboveBoxes: 4.5, // items start this many box heights above the rim, out of frame
  settleMaxSteps: 300, // hard cap after the last drop
  settleSpeed: 0.06, // body counts as resting below this speed (px per step)
  settleQuietSteps: 24, // ...for this many steps in a row
  // Depth lanes (share of the floor half-depth, − is the back): more items, more lanes.
  laneSets: Object.freeze([
    { minItems: 6, depths: Object.freeze([0, -0.2, 0.2, -0.38, 0.38]) },
    { minItems: 3, depths: Object.freeze([0, -0.26, 0.26]) },
    { minItems: 0, depths: Object.freeze([0]) },
  ]),
  laneMargin: 4, // an item goes only into a lane at least this much wider than itself
  wallThickness: 40,
  wallAboveRim: 20, // invisible lane walls end this far above the opening
  hullShrink: 0.75, // collision shapes smaller than the sprites, so the pile nests and overlaps
  spawnTilt: 0.18, // radians either way
  spawnSpin: 0.015,
});

// Scroll runway of the kit section, in svh.
export const RUNWAY = Object.freeze({
  perItem: 42,
  minDrop: 120,
  lid: 70,
  hold: 30,
  finale: 110,
});

export const EASE_FOLLOW = 0.22; // share of the gap to the scroll target closed each frame

// «Билет в галерею» (js/gallery.js) replaces the six-line «Работы» list under the showreel.
// Off until the gallery is checked; ?gallery in the URL turns it on for a check.
export const GALLERY_ON = true;
