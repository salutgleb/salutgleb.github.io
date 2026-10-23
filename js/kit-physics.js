// Records the kit falling into the box once, at load. Designed keyframes, not a physics run:
// every item drops from just above the stage into its packed pose (manifest box.packing), lands
// with a small hop and a rock that settles on an exact quarter turn, so the packed kit is
// pixel-exact and never piles up. Scroll picks a recorded frame, so scrolling back plays the
// drop backwards exactly. Same numbers on every device: + − × ÷, a seeded PRNG, detSin.

import { KIT } from './config.js';
import { mulberry32 } from './util.js';
import { convexHull } from './geometry.js';
import { detCos, detSin } from './detmath.js';

/**
 * @typedef {{ index: number, depth: number, left: number, right: number, floorY: number }} Lane
 * @typedef {{ id: string, x: number, y: number, turn: number,
 *             view?: { w: number, h: number, hull?: Array<[number, number]>, image: CanvasImageSource,
 *                      imageDark?: CanvasImageSource|null }|null }} RestPose top-left of the sprite
 *   after `turn` quarter turns clockwise, in box px; view: the sprite the box shows instead of the icon
 * @typedef {{ id: string, w: number, h: number, hull: Array<[number, number]> }} KitItem
 * @typedef {{ frameCount: number, itemCount: number, data: Float32Array,
 *             spawnFrame: Int32Array, showFrame: Int32Array, landFrame: Int32Array,
 *             laneOf: Int8Array, order: number[], turn: Int8Array,
 *             size: Array<[number, number]>, rest: Array<[number, number]>,
 *             centre: Array<[number, number]>, views: Array<object|null> }} KitRecording
 *   data holds, per frame and item: fall (share of the drop still ahead, 0 at rest), x, y (sprite
 *   centre in box px without the drop) and a (radians on top of the quarter turn).
 */

export const FALL = Object.freeze({
  dropEvery: 52, // frames between two items entering the stage
  fallFrames: 40, // from just above the stage to the packed pose
  showShare: 0.2, // the caption switches to an item this far into its fall
  tilt: 0.14, // radians either way at the top of the fall, gone at the landing
  drift: 6, // px of sideways drift at the top of the fall, gone at the landing
  hopShare: 0.05, // the first hop rises by this share of the item height...
  hopMaxPx: 4, // ...at most this many px, and never past the back rim
  hopFrames: 11,
  hop2Share: 0.4, // the second hop, relative to the first
  hop2Frames: 7,
  rock: 0.14, // radians of the first rock on landing (pivot: the bottom centre)
  rockFrames: 20,
  holdFrames: 24, // still frames after the last landing
});
const STRIDE = 4;

/**
 * Depth lanes inside the box: the fallback places an item that has no packed pose on the lane
 * floor. buildLanes also hands the packing plan on to recordKit (the floor carries it).
 * @param {{ x: number, y: number, w: number, h: number, packing?: RestPose[] }} floor
 * @param {readonly number[]} depths share of the half-depth, −1 back corner … +1 front corner
 * @param {number} [inset] walls move in by this much
 * @returns {Lane[] & { packing: RestPose[] }}
 */
export function buildLanes(floor, depths = [0], inset = 0) {
  const cx = floor.x + floor.w / 2;
  const cy = floor.y + floor.h / 2;
  const lanes = depths.map((depth, index) => {
    const half = Math.max(4, (floor.w / 2) * (1 - Math.abs(depth)) - inset);
    return Object.freeze({ index, depth, left: cx - half, right: cx + half, floorY: cy + depth * (floor.h / 2) });
  });
  return Object.freeze(
    Object.assign(lanes, {
      packing: Array.isArray(floor.packing) ? floor.packing : [],
      swallow: Boolean(floor.swallow),
      mouth: Object.freeze({ cx, half: floor.w / 2, depth: floor.h }),
    }),
  );
}

/**
 * How far a sprite can stick out past its shrunk collision hull (fallback lanes only).
 * @param {Array<{ w: number, h: number }>} items
 */
export function spriteOverhang(items) {
  const longest = Math.max(0, ...items.map((it) => Math.max(it.w, it.h)));
  return ((1 - KIT.hullShrink) / 2) * longest;
}

/**
 * Lane depths for a number of items.
 * @param {number} n
 * @returns {readonly number[]}
 */
export function laneDepthsFor(n) {
  return KIT.laneSets.find((set) => n >= set.minItems).depths;
}

/**
 * Convex hull of a sprite's opaque pixels, in sprite pixel coordinates.
 * @param {Uint8ClampedArray} rgba
 * @param {number} w
 * @param {number} h
 * @returns {Array<[number, number]>}
 */
export function spriteHull(rgba, w, h) {
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rgba[(y * w + x) * 4 + 3] > 127;
  const corners = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!opaque(x, y)) continue;
      const edge = !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1);
      if (edge) corners.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
    }
  }
  const hull = convexHull(corners);
  return hull.length >= 3 ? hull : [[0, 0], [w, 0], [w, h], [0, h]];
}

/**
 * A point of a w × h sprite (pixel-edge coordinates) after quarter turns clockwise.
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} turn 0..3
 * @returns {[number, number]}
 */
export function turnPoint(x, y, w, h, turn) {
  if (turn === 1) return [h - y, x];
  if (turn === 2) return [w - x, h - y];
  if (turn === 3) return [y, w - x];
  return [x, y];
}

const quarter = (t) => ((Math.round(Number(t) || 0) % 4) + 4) % 4;

// Bottomless box: each item drops through the opening, a little left or right of the middle,
// and ends below the front corner of the opening, where the mask has dissolved it completely.
const SWALLOW_OFFSETS = [0, -0.45, 0.4, -0.2, 0.5, -0.35];

function swallowPoses(items, lanes, rimTopY) {
  const { cx, half, depth } = lanes.mouth;
  const hidden = rimTopY + depth + 2;                 // just below the opening's front corner
  const poses = items.map((item, k) => {
    const room = Math.max(0, half - item.w / 2 - 12);
    const x = Math.round(cx + SWALLOW_OFFSETS[k % SWALLOW_OFFSETS.length] * room - item.w / 2);
    return { i: k, turn: 0, w: item.w, h: item.h, sw: item.w, sh: item.h, hull: item.hull, view: null, x, y: hidden, rank: k };
  });
  return { poses, order: poses.map((p) => p.i) };
}

// Resting poses: the packing plan where it names the item, otherwise the middle of a fallback
// lane on its floor. Painter's order: the plan's order first, then the lanes back to front.
function planPoses(items, lanes) {
  const plan = lanes.packing || [];
  const byLane = [...lanes].sort((a, b) => a.depth - b.depth);
  let spare = 0;
  const poses = items.map((item, i) => {
    const at = plan.findIndex((p) => p && p.id === item.id);
    if (at >= 0) {
      const turn = quarter(plan[at].turn);
      const view = plan[at].view || null;
      const sw = view ? view.w : item.w;
      const sh = view ? view.h : item.h;
      const [w, h] = turn % 2 ? [sh, sw] : [sw, sh];
      return { i, turn, w, h, sw, sh, hull: (view && view.hull) || item.hull, view, x: Math.round(plan[at].x), y: Math.round(plan[at].y), rank: at };
    }
    const lane = byLane[spare++ % byLane.length];
    const x = Math.round((lane.left + lane.right) / 2 - item.w / 2);
    return {
      i, turn: 0, w: item.w, h: item.h, sw: item.w, sh: item.h, hull: item.hull, view: null,
      x, y: Math.round(lane.floorY - item.h), rank: plan.length + 1 + lane.depth,
    };
  });
  const order = [...poses].sort((a, b) => a.rank - b.rank || a.i - b.i).map((p) => p.i);
  return { poses, order };
}

// Rows of free space between the item's top and the back rim, at its resting pose, per hull
// vertex (the rim is a 2:1 V, the item a convex hull, so the vertices decide).
function rimClearance(pose, rim) {
  const { sw, sh } = pose;
  const hull = pose.hull && pose.hull.length >= 3 ? pose.hull : [[0, 0], [sw, 0], [sw, sh], [0, sh]];
  return hull.map(([hx, hy]) => {
    const [x, y] = turnPoint(hx, hy, sw, sh, pose.turn);
    return { dx: x - pose.w / 2, free: pose.y + y - rim(pose.x + x) };
  });
}

function landingMotion(pose, rim) {
  const free = rimClearance(pose, rim);
  const room = Math.min(...free.map((v) => v.free)) - 1;
  const hop = Math.max(0, Math.min(FALL.hopShare * pose.h, FALL.hopMaxPx, room));
  // A rock about the bottom centre lifts a vertex by about |dx| · angle.
  const rock = free.reduce((a, v) => Math.min(a, Math.abs(v.dx) < 1 ? a : (v.free - 1) / Math.abs(v.dx)), FALL.rock);
  return { hop: hop >= 1 ? hop : 0, rock: Math.max(0, rock) };
}

function poseAtTime(t, pose, motion, start) {
  const T = FALL.fallFrames;
  const cx = pose.x + pose.w / 2;
  const bottom = pose.y + pose.h;
  if (t < T) {
    const p = Math.max(0, t) / T;
    const ease = (1 - p) * (1 - p);
    const a = start.tilt * ease;
    return [1 - p * p, cx + start.drift * ease, bottom - pose.h / 2, a];
  }
  const tau = t - T;
  let lift = 0;
  if (tau < FALL.hopFrames) {
    const u = tau / FALL.hopFrames;
    lift = motion.hop * 4 * u * (1 - u);
  } else if (tau < FALL.hopFrames + FALL.hop2Frames) {
    const u = (tau - FALL.hopFrames) / FALL.hop2Frames;
    lift = motion.hop * FALL.hop2Share * 4 * u * (1 - u);
  }
  const half = pose.h / 2;
  if (tau >= FALL.rockFrames || motion.rock === 0) return [0, cx, bottom - lift - half, 0];
  const u = tau / FALL.rockFrames;
  const a = motion.rock * start.side * (1 - u) * (1 - u) * detSin(3 * Math.PI * u);
  // Rotating about the bottom centre: the sprite centre swings around it.
  return [0, cx + half * detSin(a), bottom - lift - half * detCos(a), a];
}

/**
 * @param {any} _Matter unused: the drop is designed, kept for the caller's signature
 * @param {{ items: KitItem[], lanes: Lane[] & { packing?: RestPose[] },
 *           box: { w: number, h: number, rimTopY: number }, seed: number }} input
 * @returns {KitRecording}
 */
export function recordKit(_Matter, { items, lanes, box, seed }) {
  const rand = mulberry32(seed);
  const n = items.length;
  const swallow = Boolean(lanes.swallow && lanes.mouth);
  const { poses, order } = swallow ? swallowPoses(items, lanes, box.rimTopY) : planPoses(items, lanes);
  const centreX = lanes.length ? (lanes[0].left + lanes[0].right) / 2 : box.w / 2;
  const rim = (x) => box.rimTopY + Math.abs(x - centreX) / 2;
  const motions = poses.map((pose) => (swallow ? { hop: 0, rock: 0 } : landingMotion(pose, rim)));
  const starts = poses.map(() => ({
    tilt: (rand() * 2 - 1) * FALL.tilt,
    drift: (rand() * 2 - 1) * FALL.drift,
    side: rand() < 0.5 ? -1 : 1,
  }));
  const spawnFrame = Int32Array.from({ length: n }, (_, k) => k * FALL.dropEvery);
  const landFrame = spawnFrame.map((s) => s + FALL.fallFrames);
  const showFrame = spawnFrame.map((s) => s + Math.round(FALL.showShare * FALL.fallFrames));
  const settle = Math.max(FALL.hopFrames + FALL.hop2Frames, FALL.rockFrames);
  const frameCount = (n ? landFrame[n - 1] : 0) + settle + FALL.holdFrames;
  const data = new Float32Array(frameCount * n * STRIDE);
  for (let f = 0; f < frameCount; f++) {
    poses.forEach((pose, i) => {
      data.set(poseAtTime(f - spawnFrame[i], pose, motions[i], starts[i]), (f * n + i) * STRIDE);
    });
  }
  const rank = new Int8Array(n);
  order.forEach((i, r) => {
    rank[i] = r;
  });
  return Object.freeze({
    frameCount,
    itemCount: n,
    data,
    spawnFrame,
    showFrame,
    landFrame,
    laneOf: rank,
    order,
    turn: Int8Array.from(poses.map((p) => p.turn)),
    size: poses.map((p) => [p.w, p.h]),
    rest: poses.map((p) => [p.x, p.y]),
    centre: poses.map((p) => [p.w / 2, p.h / 2]),
    views: poses.map((p) => p.view),
    swallow,
  });
}

/**
 * Pose of item i at a fractional frame, interpolated.
 * @param {KitRecording} rec
 * @param {number} frame
 * @param {number} i
 * @returns {{ fall: number, x: number, y: number, a: number }}
 */
export function poseAt(rec, frame, i) {
  const f = Math.max(0, Math.min(rec.frameCount - 1, frame));
  const f0 = Math.floor(f);
  const f1 = Math.min(rec.frameCount - 1, f0 + 1);
  const t = f - f0;
  const o0 = (f0 * rec.itemCount + i) * STRIDE;
  const o1 = (f1 * rec.itemCount + i) * STRIDE;
  const d = rec.data;
  const mix = (k) => d[o0 + k] + (d[o1 + k] - d[o0 + k]) * t;
  return { fall: mix(0), x: mix(1), y: mix(2), a: mix(3) };
}
