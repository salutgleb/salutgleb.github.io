// The box shakes, breaks into its own pixels, the pixels rise as rockets and burst into a salute,
// a second wave of rockets bursts around them, and the box's sparks settle into the word
// «САЛЮТ». Every phase is a pure function of t (ms since the trigger) and a seed: replay is t = 0
// again, reduced motion is t = end, frames are the same on every device.

import { PAL, SALUTE } from './palette.js';
import { clamp, lerp, smoothstep, easeInOutCubic, easeOutCubic, mulberry32, hash2 } from './util.js';
import { pixelsOf } from './assets.js';
import { buildWaves, waveHeadAt, waveSparkAt, wavesEnd } from './finale-waves.js';

export const TIMING = Object.freeze({
  shakeStep: 60,
  pixelate: 540, // the shaken box turns into a mosaic of its own pixels
  scatter: 620, // ...which flies apart
  launch: 900, // first rocket
  stagger: 115,
  flight: 720,
  trailStep: 9, // ms between pixels following one rocket
  settleDelay: 430,
  settleSpread: 260,
  settleDur: 900,
  cool: 260, // a landed spark turns white after this long
  twinkleStep: 200,
  secondWave: 1950, // ground rockets start here
});

const SHAKE_X = Object.freeze([1, -1, 2, -2, 1, 0, 2, -1, 0]);
const SHAKE_Y = Object.freeze([0, 0, -1, 0, 0, -1, 0, 0, 0]);
const MAX_CELLS = 200; // box pixels that become particles
const BUDGET = 290; // every particle on screen at once, rocket heads included (limit 300)
const DRAG = 2.4; // per second
const GRAVITY_SCATTER = 170;
const GRAVITY_SPARK = 26;
const TWINKLE_SHARE = 0.08;
const FRESH_SPARK_MS = 300;
const SPARK_CSS = 3; // a spark is about this many CSS px wide
const WORD_SHARE = 0.8; // the word spans at most this share of the stage width
const WORD_CSS_MAX = 820;
const REFERENCE_CSS = 390; // bursts are tuned for a stage this wide, larger stages get larger bursts

/**
 * Size of one font pixel of the word, in art px.
 * @param {number} artW
 * @param {number} cssPerArt
 * @param {{ w: number }} word
 */
export function wordCell(artW, cssPerArt, word) {
  const width = Math.min(artW * WORD_SHARE, WORD_CSS_MAX / cssPerArt);
  return clamp(Math.floor(width / word.w), 2, 64);
}

function sampleCells(sprite) {
  const w = sprite.width;
  const h = sprite.height;
  const data = pixelsOf(sprite, w, h);
  for (let cs = 2; cs <= 24; cs++) {
    const list = cellsAt(data, w, h, cs);
    if (list.length <= MAX_CELLS) return { cs, list };
  }
  return { cs: 24, list: cellsAt(data, w, h, 24).slice(0, MAX_CELLS) };
}

function cellsAt(data, w, h, cs) {
  const list = [];
  for (let y = 0; y < h; y += cs) {
    for (let x = 0; x < w; x += cs) {
      const counts = new Map();
      let opaque = 0;
      for (let j = 0; j < cs && y + j < h; j++) {
        for (let i = 0; i < cs && x + i < w; i++) {
          const o = ((y + j) * w + x + i) * 4;
          if (data[o + 3] < 128) continue;
          opaque++;
          const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      if (opaque * 2 < cs * cs) continue;
      let best = 0;
      let bestN = -1;
      counts.forEach((n, key) => {
        if (n > bestN) {
          best = key;
          bestN = n;
        }
      });
      list.push({ x, y, color: `#${best.toString(16).padStart(6, '0')}` });
    }
  }
  return list;
}

function ballistic(x0, y0, vx, vy, g, s) {
  const f = (1 - Math.exp(-DRAG * s)) / DRAG;
  return [x0 + vx * f, y0 + (vy + g / DRAG) * f - (g / DRAG) * s];
}

function headAt(rocket, t) {
  const u = clamp((t - rocket.launchAt) / rocket.flight, 0, 1);
  return [lerp(rocket.lx, rocket.ax, smoothstep(u)), lerp(rocket.ly, rocket.ay, easeOutCubic(u))];
}

/**
 * @param {{ box: any, boxX: number, boxY: number, artW: number, artH: number, cssPerArt: number,
 *           word: import('./word.js').WordPixels, wordCentreX: number, wordTopY: number,
 *           cell?: number, seed: number }} input
 */
export function buildFinale(input) {
  const { cssPerArt } = input;
  const unitCss = clamp(Math.min(input.artW, input.artH * 1.5) * cssPerArt / REFERENCE_CSS, 1, 2.6);
  const f = (3 * unitCss) / cssPerArt; // art px per "tuned px": the constants were set at 3 CSS px per art px
  const px = Math.max(1, Math.round(SPARK_CSS / cssPerArt));
  let plan = null;
  for (let perBurst = 32; perBurst >= 6; perBurst -= 2) {
    plan = assemble(input, { f, px, perBurst });
    if (peakCount(plan) <= BUDGET) break;
  }
  return plan;
}

function assemble(input, { f, px, perBurst }) {
  const { box, boxX, boxY, artW, artH, word, wordCentreX, wordTopY, seed, cssPerArt } = input;
  const rand = mulberry32(seed);
  const { cs, list } = sampleCells(box.closedSprite());
  const cell = input.cell || wordCell(artW, cssPerArt, word);
  const block = Math.max(2, cell - Math.max(1, Math.round(cell / 6)));
  const wordX = Math.round(wordCentreX - (word.w * cell) / 2);
  const wordY = Math.round(wordTopY);
  const targetsByLetter = Array.from({ length: word.letters }, () => []);
  word.points.forEach(([fx, fy, letter]) => targetsByLetter[letter].push([wordX + fx * cell, wordY + fy * cell]));

  const rocketCount = word.letters + 2;
  const groundY = boxY + (Number.isFinite(box.groundY) ? box.groundY : box.h - 2);
  const cells = list.map((c) => ({ ...c, sx: boxX + c.x, sy: boxY + c.y })).sort((a, b) => a.sx - b.sx || a.sy - b.sy);
  const groups = splitGroups(cells, targetsByLetter);
  const order = shuffle([...Array(rocketCount).keys()], rand);

  const rockets = groups.map((group, r) => {
    const isLetter = r > 0 && r <= word.letters;
    const letterTargets = isLetter ? targetsByLetter[r - 1] : [];
    const lx = Math.round(group.reduce((s, c) => s + c.sx, 0) / Math.max(1, group.length));
    const apex = isLetter
      ? [mean(letterTargets.map((p) => p[0])) + (rand() - 0.5) * 6 * f, wordY - (12 + rand() * 14) * f]
      : [r === 0 ? wordX - 16 * f : wordX + word.w * cell + 16 * f, wordY - (26 + rand() * 12) * f];
    return Object.freeze({
      lx,
      ly: groundY - 2 * px,
      ax: Math.round(clamp(apex[0], 6 * px, artW - 6 * px)),
      ay: Math.round(Math.max(6 * px, apex[1])),
      launchAt: TIMING.launch + order[r] * TIMING.stagger,
      flight: TIMING.flight * (0.9 + rand() * 0.2),
      color: r === 0 ? SALUTE[5] : r === rocketCount - 1 ? SALUTE[6] : SALUTE[(r - 1) % 5],
      letterTargets,
    });
  });

  const centreX = boxX + box.w / 2;
  const centreY = boxY + box.h * 0.6;
  const particles = groups.flatMap((group, r) => buildGroup(group, rockets[r], { rand, f, cs, centreX, centreY }));
  const wordParticles = particles.filter((p) => p.tx !== undefined);
  const lastRocket = Math.max(...rockets.map((r) => r.launchAt + r.flight));
  const wordEnd = wordParticles.length
    ? Math.max(...wordParticles.map((p) => p.settleStart + TIMING.settleDur + TIMING.cool)) + 60
    : lastRocket + 1500;
  const waves = buildWaves({
    artW,
    artH,
    groundY,
    unit: f,
    px,
    rand,
    start: TIMING.secondWave,
    word: { x: wordX, y: wordY, w: word.w * cell, h: word.h * cell },
    crackleAt: wordEnd - 380,
    perBurst,
  });
  const end = Math.max(wordEnd, wavesEnd(waves));
  return Object.freeze({ box, boxX, boxY, groundY, cs, px, block, cell, rockets, particles, waves, wordEnd, end, wordX, wordY, word });
}

function mean(values) {
  return values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
}

function shuffle(values, rand) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Contiguous slices of the x-sorted cells: side rockets at the ends, one rocket per letter
// between them, each letter group big enough to fill its letter.
function splitGroups(cells, targetsByLetter) {
  const need = targetsByLetter.map((t) => t.length + 4);
  const sides = 2;
  const spare = Math.max(0, cells.length - need.reduce((s, n) => s + n, 0));
  const share = Math.floor(spare / (targetsByLetter.length + sides));
  const sizes = [share, ...need.map((n) => n + share), 0];
  sizes[sizes.length - 1] = Math.max(0, cells.length - sizes.slice(0, -1).reduce((s, n) => s + n, 0));
  let at = 0;
  return sizes.slice(0, targetsByLetter.length + sides).map((size) => {
    const group = cells.slice(at, at + size);
    at += size;
    return group;
  });
}

// Each burst is a two-tier peony: every other spark flies on an inner ring.
function buildGroup(group, rocket, { rand, f, cs, centreX, centreY }) {
  const ranked = [...group].sort(
    (a, b) => Math.hypot(a.sx - rocket.lx, a.sy - rocket.ly) - Math.hypot(b.sx - rocket.lx, b.sy - rocket.ly),
  );
  const n = ranked.length;
  const sparks = ranked.map((c, rank) => {
    const angle = (rank / Math.max(1, n)) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const tier = rank % 2 ? 0.55 + rand() * 0.12 : 0.9 + rand() * 0.15;
    const speed = 78 * f * tier;
    const dx = c.sx + cs / 2 - centreX;
    const dy = c.sy + cs / 2 - centreY;
    const d = Math.hypot(dx, dy) || 1;
    const push = (50 + rand() * 70) * f;
    return {
      x0: c.sx,
      y0: c.sy,
      color: c.color,
      vx: (dx / d) * push,
      vy: (dy / d) * push - (30 + rand() * 40) * f,
      svx: Math.cos(angle) * speed,
      svy: Math.sin(angle) * speed,
      angle,
      trailDelay: rank * TIMING.trailStep,
      life: 560 + rand() * 520,
      rocket,
      f,
    };
  });
  return assignTargets(sparks, rocket);
}

// Sparks and letter pixels are both ordered by angle around the burst, so they rarely cross.
function assignTargets(sparks, rocket) {
  const targets = [...rocket.letterTargets].sort(
    (a, b) => Math.atan2(a[1] - rocket.ay, a[0] - rocket.ax) - Math.atan2(b[1] - rocket.ay, b[0] - rocket.ax),
  );
  const byAngle = [...sparks].sort((a, b) => normAngle(a.angle) - normAngle(b.angle));
  const chosen = new Map();
  targets.forEach((target, i) => {
    const spark = byAngle[Math.floor(((i + 0.5) * byAngle.length) / targets.length)];
    if (spark && !chosen.has(spark)) chosen.set(spark, target);
  });
  const far = Math.max(1, ...[...chosen.values()].map((t) => Math.hypot(t[0] - rocket.ax, t[1] - rocket.ay)));
  return sparks.map((s) => {
    const burstAt = rocket.launchAt + rocket.flight + s.trailDelay;
    const target = chosen.get(s);
    if (!target) return Object.freeze({ ...s, burstAt });
    const settleStart =
      burstAt + TIMING.settleDelay + (Math.hypot(target[0] - rocket.ax, target[1] - rocket.ay) / far) * TIMING.settleSpread;
    return Object.freeze({ ...s, burstAt, tx: target[0], ty: target[1], settleStart });
  });
}

function normAngle(a) {
  const two = Math.PI * 2;
  return ((a % two) + two) % two;
}

/**
 * State of one box particle at time t, or null when it is not drawn.
 */
function particleAt(plan, p, t, twinkle) {
  if (t < TIMING.pixelate) return null;
  if (t < TIMING.scatter) return { x: p.x0, y: p.y0, size: plan.cs, color: p.color };
  const r = p.rocket;
  const s = (t - TIMING.scatter) / 1000;
  const [bx, byRaw] = ballistic(p.x0, p.y0, p.vx, p.vy, GRAVITY_SCATTER * p.f, s);
  const looseSize = Math.max(plan.px, plan.cs - 1);
  const by = Math.min(byRaw, plan.groundY - looseSize);
  const gather = smoothstep((t - (r.launchAt - 140)) / 300);
  if (t < p.burstAt) {
    const [hx, hy] = headAt(r, t - p.trailDelay);
    const size = Math.max(plan.px, Math.round(lerp(looseSize, plan.px, gather)));
    return { x: lerp(bx, hx, gather), y: lerp(by, hy, gather), size, color: gather > 0.7 ? r.color.trail : p.color };
  }
  const ss = (t - p.burstAt) / 1000;
  const g = GRAVITY_SPARK * p.f;
  const [sx, sy] = ballistic(r.ax, r.ay, p.svx, p.svy, g, ss);
  const trail = [0.035, 0.07]
    .filter((back) => ss - back > 0)
    .map((back) => {
      const [tx, ty] = ballistic(r.ax, r.ay, p.svx, p.svy, g, ss - back);
      return [tx, ty, r.color.trail];
    });
  const age = t - p.burstAt;
  const fresh = age < FRESH_SPARK_MS ? 2 * plan.px : plan.px;
  if (p.tx === undefined) {
    if (age > p.life) return null;
    if (age > p.life - 150 && Math.floor(age / 50) % 2 === 1) return null;
    return { x: sx, y: sy, size: fresh, color: r.color.main, trail: age < 420 ? trail : [] };
  }
  const u = clamp((t - p.settleStart) / TIMING.settleDur, 0, 1);
  const e = easeInOutCubic(u);
  const landedFor = t - (p.settleStart + TIMING.settleDur);
  const size = u >= 1 ? plan.block : Math.max(fresh, plan.px + Math.round((plan.block - plan.px) * e * e));
  let color = landedFor > TIMING.cool ? PAL.white : r.color.main;
  if (twinkle && t > plan.wordEnd && hash2(Math.round(p.tx * 7 + p.ty), Math.floor(t / TIMING.twinkleStep)) < TWINKLE_SHARE) {
    color = r.color.main === PAL.white ? PAL.lamp : r.color.main;
  }
  return { x: lerp(sx, p.tx, e), y: lerp(sy, p.ty, e), size, color, landed: u >= 1, trail: u < 0.02 ? trail : [] };
}

// A rocket head with a short stepped trail behind it.
function drawHead(ctx, plan, x, y, prev, color) {
  prev.forEach(([tx, ty]) => put(ctx, tx, ty, plan.px, color.trail));
  put(ctx, x, y, 2 * plan.px, color.main);
  put(ctx, x, y - plan.px, plan.px, PAL.white);
}

function headTrail(at, t) {
  return [30, 60, 90].map((back) => at(t - back));
}

/**
 * Draw the finale at time t into an art-space context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof buildFinale>} plan
 * @param {number} t
 * @param {{ twinkle?: boolean }} [options]
 */
export function drawFinale(ctx, plan, t, options = {}) {
  if (t < TIMING.pixelate) {
    const step = Math.floor(t / TIMING.shakeStep);
    const nudge = Math.max(1, Math.round(plan.px / 2));
    const dx = t > 0 ? SHAKE_X[step % SHAKE_X.length] * nudge : 0;
    const dy = t > 0 ? SHAKE_Y[step % SHAKE_Y.length] * nudge : 0;
    plan.box.drawClosed(ctx, plan.boxX + dx, plan.boxY + dy, 1);
    return;
  }
  const twinkle = options.twinkle !== false;
  const states = plan.particles.map((p) => particleAt(plan, p, t, twinkle)).filter(Boolean);
  const waveStates = plan.waves.sparks.map((p) => waveSparkAt(p, t, plan.px)).filter(Boolean);
  [...waveStates, ...states].forEach((s) => (s.trail || []).forEach(([x, y, c]) => put(ctx, x, y, plan.px, c)));
  waveStates.forEach((s) => put(ctx, s.x, s.y, s.size, s.color));
  states.forEach((s) => {
    if (!s.landed) put(ctx, s.x, s.y, s.size, s.color);
  });
  plan.rockets.forEach((r) => {
    if (t < r.launchAt || t >= r.launchAt + r.flight) return;
    const [hx, hy] = headAt(r, t);
    drawHead(ctx, plan, hx, hy, headTrail((tt) => headAt(r, Math.max(r.launchAt, tt)), t), r.color);
  });
  plan.waves.rockets.forEach((r) => {
    if (t < r.launchAt || t >= r.launchAt + r.flight) return;
    const [hx, hy] = waveHeadAt(r, t);
    drawHead(ctx, plan, hx, hy, headTrail((tt) => waveHeadAt(r, Math.max(r.launchAt, tt)), t), r.color);
  });
  const shadow = Math.max(1, Math.round(plan.cell / 8));
  const landed = states.filter((s) => s.landed);
  landed.forEach((s) => put(ctx, s.x + shadow, s.y + shadow, s.size, PAL.ink));
  landed.forEach((s) => put(ctx, s.x, s.y, s.size, s.color));
}

function put(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
}

/**
 * Particles on screen at time t, rocket heads included. Used to keep the 300 budget.
 */
export function aliveCount(plan, t) {
  if (t < TIMING.pixelate) return 0;
  const box = plan.particles.filter((p) => particleAt(plan, p, t, false)).length;
  const waves = plan.waves.sparks.filter((p) => t >= p.burstAt && t <= p.burstAt + p.life).length;
  const heads = [...plan.rockets, ...plan.waves.rockets].filter((r) => t >= r.launchAt && t < r.launchAt + r.flight).length;
  return box + waves + heads;
}

function peakCount(plan) {
  let peak = 0;
  for (let t = TIMING.pixelate; t <= plan.end; t += 20) peak = Math.max(peak, aliveCount(plan, t));
  return peak;
}

export { peakCount };
