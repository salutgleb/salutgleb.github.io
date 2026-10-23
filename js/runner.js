// The running avatar (Gleb): sprite strips per clip and direction from manifest-runner.json,
// drawn with its feet on a floor point at a whole number of art px per sprite px. Until the
// animations exist the team avatar stands in: the same sprite, bobbing and mirrored.

import { assetUrl, loadImage, loadJSON, warn } from './assets.js';

export const RUNNER_MANIFEST = 'assets/manifest-runner.json';
const PLACEHOLDER_SPRITE = 'sprites/team/gleb-still.png';
const MIRROR = Object.freeze({ e: 'w', w: 'e', se: 'sw', sw: 'se', ne: 'nw', nw: 'ne', s: 's', n: 'n' });
// When a direction is missing: the nearest drawn one, in this order.
const NEAREST = Object.freeze({
  s: ['se', 'sw', 'e', 'w'],
  n: ['ne', 'nw', 'e', 'w'],
  e: ['se', 'ne', 's'],
  w: ['sw', 'nw', 's'],
  se: ['e', 's', 'sw'],
  sw: ['w', 's', 'se'],
  ne: ['e', 'n', 'nw'],
  nw: ['w', 'n', 'ne'],
});
const PLACEHOLDER_BOB = Object.freeze({ run: [0, -2, -3, -2, 0, -2, -3, -2], carry: [0, -1, -2, -1], idle: [0, 0, -1, -1] });
const PLACEHOLDER_MS = Object.freeze({ run: 60, carry: 70, idle: 260 });
const DIR_NAMES = Object.freeze(['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']);

/**
 * Screen-space direction of a move in art px.
 * @param {number} dx
 * @param {number} dy
 * @returns {string} one of s, se, e, ne, n, nw, w, sw
 */
export function dirOf(dx, dy) {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 's';
  const angle = Math.atan2(dy, dx); // 0 = east, positive = down the screen
  return DIR_NAMES[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
}

/**
 * @typedef {{ image: CanvasImageSource, frames: number, w: number, h: number, flip: boolean }} Strip
 * @typedef {{ ms: number, loop: boolean, reverse: boolean, bob: number[], dirs: Map<string, Strip> }} Clip
 * A clip spec may be { "reverseOf": "lift", "ms": 60 }: another clip's strips played backwards.
 */

async function loadStrip(file, frame) {
  const image = await loadImage(assetUrl(file));
  if (!image) return null;
  const frames = Math.max(1, Math.round(image.naturalWidth / frame[0]));
  return { image, frames, w: frame[0], h: frame[1], flip: false };
}

async function loadClip(spec, frame) {
  const dirs = new Map();
  const mirrors = [];
  await Promise.all(
    Object.entries(spec.dirs || {}).map(async ([dir, entry]) => {
      if (entry && typeof entry === 'object' && entry.mirror) {
        mirrors.push([dir, entry.mirror]);
        return;
      }
      const strip = await loadStrip(entry, frame);
      if (strip) dirs.set(dir, strip);
    }),
  );
  mirrors.forEach(([dir, from]) => {
    const source = dirs.get(from);
    if (source) dirs.set(dir, { ...source, flip: true });
  });
  if (!dirs.size) return null;
  return {
    ms: Number(spec.ms) || 90,
    loop: spec.loop !== false,
    reverse: false,
    bob: Array.isArray(spec.bob) ? spec.bob : [],
    hold: Array.isArray(spec.hold) ? spec.hold : null,
    dirs,
  };
}

// Clips that replay another clip backwards share its strips.
function addReversed(clips, specs) {
  Object.entries(specs).forEach(([name, spec]) => {
    const source = spec && spec.reverseOf ? clips.get(spec.reverseOf) : null;
    if (!source) return;
    clips.set(name, { ...source, ms: Number(spec.ms) || source.ms, loop: spec.loop === true, reverse: true });
  });
}

function stripFor(clip, dir) {
  if (clip.dirs.has(dir)) return clip.dirs.get(dir);
  const mirrored = clip.dirs.get(MIRROR[dir]);
  if (mirrored) return { ...mirrored, flip: !mirrored.flip };
  for (const near of NEAREST[dir] || []) {
    if (clip.dirs.has(near)) return clip.dirs.get(near);
  }
  return clip.dirs.values().next().value;
}

function frameAt(clip, strip, t) {
  const i = Math.floor(Math.max(0, t) / clip.ms);
  const k = clip.loop ? i % strip.frames : Math.min(strip.frames - 1, i);
  return clip.reverse ? strip.frames - 1 - k : k;
}

// A clip not drawn yet borrows the nearest one: running with a load is still running, the
// gestures are a standing pose.
const STAND_IN = Object.freeze({ carry: 'run', put: 'lift', pull: 'toss', idle: 'stand' });

function createRunner({ clips, scale, feet, head, placeholder }) {
  const fallback = clips.get('stand') || clips.get('idle') || clips.get('run') || clips.values().next().value;
  const clipOf = (name) => {
    for (let n = name; n; n = STAND_IN[n]) {
      if (clips.has(n)) return clips.get(n);
    }
    return fallback;
  };

  return Object.freeze({
    placeholder,
    scale,
    /** Feet to the top of the head, in art px. */
    height: (feet[1] - head[1]) * scale,
    has: (name) => clips.has(name),
    /** One pass of a clip in ms. */
    duration(name) {
      const clip = clipOf(name);
      return clip.ms * clip.dirs.values().next().value.frames;
    },
    /** Head top relative to the feet at time t (negative is up), bob included. */
    headY(name, dir, t) {
      const clip = clipOf(name);
      const strip = stripFor(clip, dir);
      const i = frameAt(clip, strip, t);
      const bob = clip.bob.length ? clip.bob[i % clip.bob.length] : 0;
      return (head[1] - feet[1] + bob) * scale;
    },
    /** Where a carried item's bottom sits relative to the feet: the raised hands when the clip
     *  says so frame by frame, otherwise just above the head. */
    holdY(name, dir, t) {
      const clip = clipOf(name);
      if (!clip.hold) return this.headY(name, dir, t);
      const strip = stripFor(clip, dir);
      const i = frameAt(clip, strip, t);
      return clip.hold[i % clip.hold.length] * scale;
    },
    /**
     * @param {CanvasRenderingContext2D} ctx art-space context
     * @param {string} name clip
     * @param {string} dir
     * @param {number} t ms since the clip started
     * @param {number} x feet, art px
     * @param {number} y feet, art px
     */
    draw(ctx, name, dir, t, x, y) {
      const clip = clipOf(name);
      const strip = stripFor(clip, dir);
      const i = frameAt(clip, strip, t);
      const bob = placeholder && clip.bob.length ? clip.bob[i % clip.bob.length] : 0;
      const w = strip.w * scale;
      const h = strip.h * scale;
      const left = Math.round(x - feet[0] * scale);
      const top = Math.round(y - feet[1] * scale + bob * scale);
      const sx = placeholder ? 0 : i * strip.w;
      ctx.save();
      if (strip.flip) {
        ctx.translate(left + w, top);
        ctx.scale(-1, 1);
        ctx.drawImage(strip.image, sx, 0, strip.w, strip.h, 0, 0, w, h);
      } else {
        ctx.drawImage(strip.image, sx, 0, strip.w, strip.h, left, top, w, h);
      }
      ctx.restore();
    },
  });
}

// The team avatar as every clip: enough to build and test the scene before the real animations.
// With one image, "frames" counts the bob steps.
async function placeholderRunner() {
  const image = await loadImage(assetUrl(PLACEHOLDER_SPRITE));
  if (!image) return null;
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const clips = new Map(
    ['idle', 'run', 'carry'].map((name) => {
      const bob = PLACEHOLDER_BOB[name];
      const strip = { image, frames: bob.length, w, h, flip: false };
      const dirs = new Map([
        ['se', strip],
        ['s', strip],
        ['sw', { ...strip, flip: true }],
      ]);
      return [name, { ms: PLACEHOLDER_MS[name], loop: true, bob, dirs }];
    }),
  );
  return createRunner({ clips, scale: 1, feet: [Math.round(w / 2), h - 1], head: [Math.round(w / 2), 0], placeholder: true });
}

/**
 * @param {string} [url]
 */
export async function loadRunner(url = RUNNER_MANIFEST) {
  const manifest = await loadJSON(url);
  if (manifest && manifest.clips && Array.isArray(manifest.frame)) {
    const drawn = Object.entries(manifest.clips).filter(([, spec]) => spec && !spec.reverseOf);
    const entries = await Promise.all(drawn.map(async ([name, spec]) => [name, await loadClip(spec, manifest.frame)]));
    const clips = new Map(entries.filter(([, clip]) => clip));
    addReversed(clips, manifest.clips);
    if (clips.size) {
      return createRunner({
        clips,
        scale: Math.max(1, Math.round(Number(manifest.scale) || 1)),
        feet: manifest.feet || [manifest.frame[0] / 2, manifest.frame[1] - 1],
        head: manifest.head || [manifest.frame[0] / 2, 0],
        placeholder: false,
      });
    }
  }
  warn('manifest-runner.json not ready, the team avatar stands in for the runner');
  return placeholderRunner();
}
