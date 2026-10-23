// Extra salute waves: rockets launched from the ground (not from the box), each bursting into a
// ring, a peony or a drooping willow, glitter that blinks as it falls, and two small crackles
// at the ends of the word once it is complete. Decoration only: none of these sparks becomes
// part of the word. Like the rest of the finale, every state is a pure function of t.

import { SALUTE } from './palette.js';
import { clamp, lerp, smoothstep, easeOutCubic, hash2 } from './util.js';

const STYLES = Object.freeze({
  ring: { speed: [0.95, 1.05], drag: 2.6, gravity: 30, life: [720, 980], trailMs: 420, glitter: 0.05 },
  peony: { speed: [0.45, 1.0], drag: 2.4, gravity: 34, life: [650, 1000], trailMs: 360, glitter: 0.18 },
  willow: { speed: [0.45, 0.75], drag: 1.5, gravity: 75, life: [1300, 1750], trailMs: 1100, glitter: 0.4 },
  crackle: { speed: [0.3, 0.7], drag: 2.2, gravity: 20, life: [450, 750], trailMs: 200, glitter: 0.7 },
});

// x as a share of the stage width, style, colour index in SALUTE.
const ROCKETS_WIDE = Object.freeze([
  { at: 0.14, style: 'willow', color: 1 },
  { at: 0.86, style: 'ring', color: 2 },
  { at: 0.5, style: 'peony', color: 4 },
  { at: 0.32, style: 'ring', color: 0 },
  { at: 0.68, style: 'willow', color: 3 },
]);
const ROCKETS_NARROW = Object.freeze([
  { at: 0.2, style: 'ring', color: 2 },
  { at: 0.8, style: 'willow', color: 1 },
  { at: 0.5, style: 'peony', color: 4 },
]);
const BLINK_MS = 70;
const FRESH_MS = 260;

const between = (range, r) => lerp(range[0], range[1], r);

function ballisticWith(x0, y0, vx, vy, g, drag, s) {
  const f = (1 - Math.exp(-drag * s)) / drag;
  return [x0 + vx * f, y0 + (vy + g / drag) * f - (g / drag) * s];
}

/**
 * Head of a ground rocket at time t: fast launch, slowing towards the apex.
 */
export function waveHeadAt(r, t) {
  const u = clamp((t - r.launchAt) / r.flight, 0, 1);
  return [lerp(r.lx, r.ax, smoothstep(u)), lerp(r.ly, r.ay, easeOutCubic(u))];
}

function burstSparks({ id, x, y, at, style, color, count, unit, rand }) {
  const s = STYLES[style];
  return Array.from({ length: count }, (_, k) => {
    const tier = style === 'peony' ? (k % 2 ? s.speed[0] + 0.1 * rand() : s.speed[1] - 0.08 * rand()) : between(s.speed, rand());
    const angle = (k / count) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const speed = 62 * unit * tier;
    return Object.freeze({
      id: id * 1000 + k,
      ax: x,
      ay: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (style === 'willow' ? 12 * unit : 0),
      g: s.gravity * unit,
      drag: s.drag,
      burstAt: at,
      life: between(s.life, rand()),
      trailMs: s.trailMs,
      glitter: rand() < s.glitter,
      color: SALUTE[color % SALUTE.length],
    });
  });
}

/**
 * @param {{ artW: number, artH: number, groundY: number, unit: number, px: number,
 *           rand: () => number, start: number, word: { x: number, y: number, w: number, h: number },
 *           crackleAt: number, perBurst: number }} input
 */
export function buildWaves(input) {
  const { artW, groundY, unit, rand, start, word, crackleAt, perBurst } = input;
  // input.px (spark pixel size) is used when drawing, not when planning.
  const layout = artW >= 240 ? ROCKETS_WIDE : ROCKETS_NARROW;
  const rockets = layout.map((spec, i) => {
    const ax = clamp(artW * spec.at + (rand() - 0.5) * 12 * unit, 8, artW - 8);
    const ay = Math.max(8, word.y - (16 + rand() * 34) * unit);
    return Object.freeze({
      ...spec,
      id: i + 1,
      lx: Math.round(clamp(artW * spec.at + (rand() - 0.5) * 20 * unit, 6, artW - 6)),
      ly: groundY - 2,
      ax: Math.round(ax),
      ay: Math.round(ay),
      launchAt: start + i * 170 + rand() * 60,
      flight: 640 + rand() * 260,
      color: SALUTE[spec.color % SALUTE.length],
    });
  });
  const rocketSparks = rockets.flatMap((r) =>
    burstSparks({ id: r.id, x: r.ax, y: r.ay, at: r.launchAt + r.flight, style: r.style, color: layout[r.id - 1].color, count: perBurst, unit, rand }),
  );
  const crackles = [
    [word.x - 6 * unit, word.y + word.h / 2, crackleAt, 1],
    [word.x + word.w + 6 * unit, word.y + word.h / 2, crackleAt + 150, 4],
  ].flatMap(([x, y, at, color], i) =>
    burstSparks({ id: 90 + i, x, y, at, style: 'crackle', color, count: Math.max(6, Math.round(perBurst / 2)), unit, rand }),
  );
  return Object.freeze({ rockets, sparks: [...rocketSparks, ...crackles] });
}

/**
 * State of one wave spark at time t, or null when it is not drawn. px is the spark pixel size.
 */
export function waveSparkAt(p, t, px = 1) {
  const age = t - p.burstAt;
  if (age < 0 || age > p.life) return null;
  if (p.glitter && age > 180 && hash2(p.id, Math.floor(t / BLINK_MS)) < 0.45) return null;
  if (age > p.life - 160 && Math.floor(age / 50) % 2 === 1) return null;
  const s = age / 1000;
  const [x, y] = ballisticWith(p.ax, p.ay, p.vx, p.vy, p.g, p.drag, s);
  const trail = [];
  if (age < p.trailMs) {
    [0.035, 0.07].forEach((back) => {
      if (s - back > 0) {
        const [tx, ty] = ballisticWith(p.ax, p.ay, p.vx, p.vy, p.g, p.drag, s - back);
        trail.push([tx, ty, p.color.trail]);
      }
    });
  }
  const cooled = age > p.life * 0.65;
  return { x, y, size: age < FRESH_MS ? 2 * px : px, color: cooled ? p.color.trail : p.color.main, trail };
}

/** The last moment any wave pixel is on screen. */
export function wavesEnd(waves) {
  return Math.max(0, ...waves.sparks.map((p) => p.burstAt + p.life));
}
