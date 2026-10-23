// First screen: the studio miniature from manifest-studio.json (layers in order, animated parts as
// horizontal strips), placed in the free area beside or under the headline, animated only on screen.
// Layers with a `role` take turns (one plays at a time, chosen by role, idle by default): the team
// members' talk and point loops, and Gleb as the studio operator acting out his speech bubbles.

import { createPixelCanvas, pickK, targetK } from './pixel-canvas.js';
import { createLoop } from './loop.js';
import { assetUrl, loadImage } from './assets.js';

const DESKTOP_MIN_CSS = 900;
const GAP_CSS = 16;
const FULL_SCENE_MIN_SHARE = 0.6; // the whole room is kept down to 60% of the target density

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

function readLayer(l, i, image, defaults = {}) {
  const frames = Math.max(1, num(l.frames ?? l.frameCount ?? l.count, 1));
  const frameW = num(l.frameW ?? l.fw ?? l.frameWidth ?? (frames > 1 ? l.w : undefined), image.naturalWidth / frames);
  const frameH = num(l.frameH ?? l.fh ?? l.frameHeight ?? (frames > 1 ? l.h : undefined), image.naturalHeight);
  const pos = l.pos || l.position || l.at || [];
  const durations = Array.isArray(l.durations) ? l.durations.map((d) => Math.max(16, num(d, 100))) : null;
  return {
    id: String(l.id || `layer-${i}`),
    image,
    x: num(l.x ?? pos[0] ?? pos.x),
    y: num(l.y ?? pos[1] ?? pos.y),
    z: num(l.z ?? l.order ?? l.layer, i),
    frames,
    frameW,
    frameH,
    ms: Math.max(16, num(l.ms ?? l.frameMs ?? l.msPerFrame ?? l.duration, 100)),
    durations,
    sequence: Array.isArray(l.sequence) ? l.sequence.map((f) => Math.max(0, Math.floor(num(f)))) : null,
    replaces: l.replaces ? String(l.replaces) : null,
    role: l.role ? String(l.role) : null, // idle | talk | point | wave | shh | turn_back
    isDefault: Boolean(l.default),
    group: l.group || l.actor ? String(l.group || l.actor) : null,
    anchor: readPoint(l.anchor || l.head), // the speaker's head in this pose, scene art px
    // a gesture or a transition: plays through once, then holds its last frame
    // talk loops for as long as a line types, unless the art says otherwise
    once: l.loop === true || (/^talk/i.test(String(l.role || '')) && l.once !== true)
      ? false
      : l.once === true || l.loop === false || Boolean(defaults.once) || /^turn/i.test(String(l.role || '')),
  };
}

function readPoint(p) {
  if (Array.isArray(p) && p.length >= 2) return [num(p[0]), num(p[1])];
  if (p && typeof p === 'object' && 'x' in p) return [num(p.x), num(p.y)];
  return null;
}

async function loadLayerList(list, defaults) {
  const loaded = await Promise.all(
    (Array.isArray(list) ? list : []).map(async (l, i) => {
      const image = l && l.file ? await loadImage(assetUrl(l.file)) : null;
      return image ? readLayer(l, i, image, defaults) : null;
    }),
  );
  return loaded.filter(Boolean);
}

// Gesture lists such as `operator_loops` (manifest-studio.json): each entry plays once.
const gestureLists = (raw) =>
  Object.keys(raw)
    .filter((key) => key !== 'loops' && /_loops$/.test(key) && Array.isArray(raw[key]))
    .map((key) => raw[key]);

/**
 * Normalise a layered scene (studio, team room, team member) into { w, h, safe, layers[] }
 * with images loaded. `loops` that name a layer in `replaces` are drawn instead of that layer
 * while animating (their frames are transparent, so drawing both would ghost).
 * @param {any} raw
 */
export async function loadStudio(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const size = raw.size || raw.canvas || {};
  const w = num(raw.w ?? raw.width ?? size.w ?? size.width ?? (Array.isArray(size) ? size[0] : 0));
  const h = num(raw.h ?? raw.height ?? size.h ?? size.height ?? (Array.isArray(size) ? size[1] : 0));
  const list = raw.layers || raw.parts || raw.sprites || [];
  if (!w || !h || !Array.isArray(list) || !list.length) return null;
  const [base, plain, ...gestures] = await Promise.all([
    loadLayerList(list),
    loadLayerList(raw.loops),
    ...gestureLists(raw).map((entries) => loadLayerList(entries, { once: true })),
  ]);
  const loops = [...plain, ...gestures.flat()];
  const ordered = base.sort((a, b) => a.z - b.z);
  // Each loop sits right where the layer it replaces sits in the drawing order.
  const layers = ordered.flatMap((layer) => [layer, ...loops.filter((lp) => lp.replaces === layer.id)]);
  layers.push(...loops.filter((lp) => !lp.replaces || !ordered.some((l) => l.id === lp.replaces)));
  if (!layers.length) return null;
  // The studio artist notes that its static layers already form a calm full frame; other
  // scenes keep their loops on frame 0 when motion is reduced.
  const notes = raw.notes || {};
  const stillSkipsLoops = /static layers only/i.test(String(notes.reduced_motion || notes.reducedMotion || ''));
  const replacedIds = Object.freeze(layers.filter((l) => l.replaces).map((l) => l.replaces));
  return Object.freeze({
    w,
    h,
    layers: Object.freeze(layers.map((l) => Object.freeze(l))),
    replacedIds,
    safe: readSafe(raw, w, h),
    stillSkipsLoops,
  });
}

// Phone safe area: { x, y, w, h } or [x, y, w, h], at the top level or under notes.
function readSafe(raw, w, h) {
  const notes = raw.notes || {};
  const safe = raw.safe || raw.safeArea || raw.phoneSafeArea || notes.phone_safe_area || notes.safe || null;
  const box = Array.isArray(safe) ? { x: safe[0], y: safe[1], w: safe[2], h: safe[3] } : safe;
  if (!box) return { x: 0, y: 0, w, h };
  return { x: num(box.x), y: num(box.y), w: num(box.w, w) || w, h: num(box.h, h) || h };
}

/**
 * Frame index of an animated layer at time t (ms): sequence[floor(t / ms) % length].
 * @param {{ frames: number, ms: number, sequence: number[]|null, durations: number[]|null }} layer
 * @param {number} t
 */
export function frameOf(layer, t) {
  const steps = layer.sequence || [...Array(layer.frames).keys()];
  if (steps.length <= 1) return steps[0] || 0;
  if (layer.durations && layer.durations.length === steps.length) {
    const total = layer.durations.reduce((s, d) => s + d, 0);
    let rest = t % total;
    for (let i = 0; i < steps.length; i++) {
      if (rest < layer.durations[i]) return steps[i];
      rest -= layer.durations[i];
    }
    return steps[steps.length - 1];
  }
  return steps[Math.floor(t / layer.ms) % steps.length];
}

const stepsOf = (layer) => layer.sequence || [...Array(layer.frames).keys()];

/**
 * How long one pass through a layer's frames takes, in ms.
 * @param {{ frames: number, ms: number, sequence: number[]|null, durations: number[]|null }} layer
 */
export function cycleMs(layer) {
  const steps = stepsOf(layer);
  if (layer.durations && layer.durations.length === steps.length) return layer.durations.reduce((s, d) => s + d, 0);
  return steps.length * layer.ms;
}

// Layers that take turns form a group: a base layer and everything that replaces it (a member's
// still and its idle, talk and point loops; the operator's idle loop and his gestures), layers
// sharing a `group`, and otherwise every layer with a role (a scene's one actor).
function groupOf(scene, l) {
  if (l.replaces) return l.replaces;
  if ((scene.replacedIds || []).includes(l.id)) return l.id; // the base of its group
  if (l.group) return l.group;
  return l.role ? 'actor' : null;
}

/**
 * The layers that play for a role: one per group. The one with that role, else the default
 * (idle) one, else the group's base, else the first.
 * @param {{ layers: any[], replacedIds?: string[] }} scene
 * @param {string} [role]
 * @returns {any[]}
 */
export function playingLoops(scene, role) {
  const keys = [...new Set(scene.layers.map((l) => groupOf(scene, l)).filter(Boolean))];
  return keys
    .map((key) => {
      const members = scene.layers.filter((l) => groupOf(scene, l) === key);
      return (
        members.find((l) => role && l.role === role) ||
        members.find((l) => l.isDefault || l.role === 'idle') ||
        members.find((l) => l.id === key) ||
        members[0]
      );
    })
    .filter(Boolean);
}

// The frame of a playing role layer: a fixed frame ('last' or an index), a transition held on its
// last frame once it has played, or the looping frame.
function poseFrame(layer, time, frame) {
  const steps = stepsOf(layer);
  const last = steps[steps.length - 1] || 0;
  if (frame === 'last') return last;
  if (Number.isFinite(frame)) return Math.max(0, Math.min(layer.frames - 1, frame));
  if (layer.once && time >= cycleMs(layer)) return last;
  return frameOf(layer, Math.max(0, time));
}

/**
 * @typedef {{ role?: string, since?: number, frame?: number|'last' }} Pose role: which layer of
 *   each group plays; since: when it started (its frames count from there); frame: hold one frame
 *   (shown even with reduced motion)
 */

/**
 * Draw a layered scene (studio or team) at (x, y) for time t. With reduced motion, loops stay on
 * their first frame, or are left out when the manifest says its static layers are complete; a
 * pose with a fixed frame is still shown.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ layers: any[] }} scene
 * @param {number} x
 * @param {number} y
 * @param {number} t
 * @param {boolean} still
 * @param {string|Pose} [pose] a role, or a pose
 */
export function drawLayers(ctx, scene, x, y, t, still, pose) {
  const p = pose && typeof pose === 'object' ? pose : { role: pose };
  const held = p.frame !== undefined;
  const playing = still && !held ? null : playingLoops(scene, p.role);
  scene.layers.forEach((layer) => {
    const group = groupOf(scene, layer);
    let f = 0;
    if (group && playing) {
      if (!playing.includes(layer)) return; // another role's layer
      f = poseFrame(layer, t - (p.since || 0), p.frame);
    } else if (group && layer.id !== group) {
      return; // reduced motion: only the base of a group, as it is
    } else if (still && layer.frames > 1 && scene.stillSkipsLoops) {
      return; // the static art already shows this part
    } else if (!still) {
      f = Math.min(layer.frames - 1, frameOf(layer, t));
    }
    ctx.drawImage(layer.image, f * layer.frameW, 0, layer.frameW, layer.frameH, x + layer.x, y + layer.y, layer.frameW, layer.frameH);
  });
}

function drawScene(ctx, scene, placeholder, x, y, t, still, pose) {
  if (scene) drawLayers(ctx, scene, x, y, t, still, pose);
  else if (placeholder) placeholder.drawPlaceholderStudio(ctx, x, y, t);
}

// Free area for the scene in CSS px, relative to the hero: right of the text on desktop,
// below it on phones.
function freeArea(hero, text, hint) {
  const h = hero.getBoundingClientRect();
  const t = text.getBoundingClientRect();
  const hintH = hint ? hint.getBoundingClientRect().height + GAP_CSS : 0;
  if (window.innerWidth >= DESKTOP_MIN_CSS) {
    const x = t.right - h.left + GAP_CSS * 2;
    return { x, y: 0, w: Math.max(1, h.width - x - GAP_CSS), h: Math.max(1, h.height - hintH) };
  }
  const y = t.bottom - h.top + GAP_CSS;
  return { x: 0, y, w: h.width, h: Math.max(1, h.height - y - hintH) };
}

/**
 * @param {{ hero: HTMLElement, wrap: HTMLElement, canvas: HTMLCanvasElement, text: HTMLElement,
 *           hint: HTMLElement|null, scene: any, reduced: boolean }} opts
 */
export function createStudio(opts) {
  const { hero, wrap, canvas, text, hint, scene, placeholder } = opts;
  const meta = scene || (placeholder && placeholder.PLACEHOLDER_STUDIO) || { w: 200, h: 140 };
  const safe = meta.safe || { x: 0, y: 0, w: meta.w, h: meta.h };
  let reduced = opts.reduced;
  let t = 0;
  let at = { x: 0, y: 0 };
  let drawnKey = '';
  let pc = null;
  const layoutListeners = new Set();
  // The operator's pose: role, when it started and a fixed frame (reduced motion); roles waiting
  // for the current gesture to finish.
  let pose = { role: 'idle', since: 0, frame: undefined };
  let queue = [];
  const actorLayer = (role) => (scene ? playingLoops(scene, role)[0] || null : null);
  const playingFor = (role) => {
    const layer = actorLayer(role);
    return layer && layer.once ? cycleMs(layer) : 0;
  };
  // ms left of the current gesture (0 for a loop, a held frame or a finished gesture)
  const remaining = () => (pose.frame === undefined ? Math.max(0, playingFor(pose.role) - (t - pose.since)) : 0);
  const start = (role) => {
    pose = { role, since: t, frame: undefined };
  };

  pc = createPixelCanvas(canvas, {
    container: wrap,
    // The whole room while it reads (down to 60% of the target density); on very small
    // screens the room is cropped to its safe area (the people and the camera), never zoomed
    // in past the target.
    kFor: (_w, _h, dpr) => {
      const free = freeArea(hero, text, hint);
      const full = Math.min(pickK(dpr, free.w * dpr, meta.w), pickK(dpr, free.h * dpr, meta.h));
      if (full >= Math.ceil(targetK(dpr) * FULL_SCENE_MIN_SHARE)) return full;
      const safeK = Math.min(pickK(dpr, free.w * dpr, safe.w), pickK(dpr, free.h * dpr, safe.h));
      return Math.max(1, Math.min(safeK, targetK(dpr)));
    },
    onResize: (view) => {
      const free = freeArea(hero, text, hint);
      const toArt = (css) => (css * view.dpr) / view.k;
      const cx = toArt(free.x + free.w / 2);
      const cy = toArt(free.y + free.h / 2);
      // The whole room centred when it fits (on phones the safe-area centre pushed it to the
      // left, Gleb 23.10: «layout на телефоне чуть жмет картинки влево»); otherwise the people
      // and the camera centred, without leaving an empty strip on one side.
      const left = toArt(free.x);
      const right = toArt(free.x + free.w);
      const fitsW = meta.w <= right - left;
      const fitsH = meta.h <= toArt(free.h);
      const x = fitsW
        ? cx - meta.w / 2
        : Math.min(left, Math.max(right - meta.w, cx - (safe.x + safe.w / 2)));
      const y = fitsH ? cy - meta.h / 2 : cy - (safe.y + safe.h / 2);
      at = {
        x: Math.round(x),
        y: Math.round(Math.min(y, toArt(free.y + free.h) - meta.h)),
      };
      drawnKey = '';
      render();
      layoutListeners.forEach((fn) => fn());
    },
  });

  // When a gesture has played through, the next queued role starts; otherwise its last frame stays.
  function settle() {
    if (queue.length && remaining() === 0) start(queue.shift());
  }

  function render() {
    if (!pc) return;
    const view = pc.view();
    const time = reduced ? 0 : t;
    const poseKey = `${pose.role}:${pose.since}:${pose.frame}`;
    const key = `${Math.floor(time / 50)}:${view.artW}x${view.artH}:${at.x},${at.y}:${poseKey}`;
    if (key === drawnKey) return;
    drawnKey = key;
    pc.ctx.clearRect(0, 0, view.artW, view.artH);
    drawScene(pc.ctx, scene, placeholder, at.x, at.y, time, reduced, { ...pose, since: reduced ? 0 : pose.since });
    pc.present();
  }

  // The free area depends on the headline's height, which changes when the web fonts arrive.
  let pending = 0;
  const relayout = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      pc.resize();
    });
  };
  new ResizeObserver(relayout).observe(text);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  render();
  createLoop(hero, (dt) => {
    if (!reduced) t += dt;
    settle();
    render();
  });

  return {
    setReduced(value) {
      reduced = value;
      drawnKey = '';
      render();
    },
    /** A point of the studio art (art px) in CSS px from the canvas's top left corner. */
    project: ([x, y]) => {
      const view = pc.view();
      return { x: (at.x + x) * view.cssPerArt, y: (at.y + y) * view.cssPerArt };
    },
    /** CSS px per art px. */
    artPx: () => pc.view().cssPerArt,
    /** Call fn after every relayout (the scene moves when the headline or the window changes). */
    onLayout: (fn) => layoutListeners.add(fn),
    /**
     * Play the operator's roles in order. A gesture plays through once and then holds its last
     * frame; a role that is already current keeps going (never restarts); while a gesture runs,
     * the new roles wait for it. A role the art lacks falls back to idle.
     * @param {string[]} roles e.g. ['shh'], ['turn_back', 'idle']
     */
    act(roles) {
      const list = roles.filter(Boolean);
      if (pose.frame !== undefined) start('idle'); // leaving a held (reduced motion) pose
      const next = list[0] === pose.role ? list.slice(1) : list;
      if (!list.length || (!next.length && list[0] === pose.role)) {
        queue = [];
        return;
      }
      queue = next;
      settle();
      render();
    },
    /** Hold one frame of a role (reduced motion), e.g. hold('wave') for his last, turned frame. */
    hold(role, frame = 'last') {
      queue = [];
      pose = { role, since: t, frame };
      render();
    },
    /** Back to filming at once (the dialogue stopped). */
    rest() {
      queue = [];
      if (pose.role !== 'idle' || pose.frame !== undefined) start('idle');
      render();
    },
    /** Whether a gesture is still playing or waiting, so a line can stay up until it is done. */
    busy: () => !reduced && (remaining() > 0 || queue.some((role) => playingFor(role) > 0)),
    /** For checks (?debug): the operator's role, held frame, queue and clock. */
    state: () => ({ role: pose.role, frame: pose.frame, queue: [...queue], since: Math.round(pose.since), t: Math.round(t) }),
    /** The operator's current crop box and its anchor if the art gives one (scene art px). */
    actorBox() {
      const layer = actorLayer(pose.role);
      return layer ? { x: layer.x, y: layer.y, w: layer.frameW, h: layer.frameH, anchor: layer.anchor } : null;
    },
  };
}
