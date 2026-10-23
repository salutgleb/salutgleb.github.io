// Drawing for the kit stage: the open box, the items at a recorded frame, the lid and the tape.
// Items live on their own layer, masked to everything above the box's lower edges, so nothing
// shows under the box. The kit is packed below the rim, so the lid simply closes over it.

import { poseAt, turnPoint } from './kit-physics.js';
import { pixelsOf, spriteOf } from './assets.js';
import { currentTheme } from './theme.js';
import { makeCanvas, fillPolygon } from './draw.js';
import { clamp, mulberry32 } from './util.js';

const CAPTION_ROOM_CSS = 92; // free space under the box for the HTML caption
const LID_CLOSE_END = 0.55; // share of the lid phase spent on the lid frames
const TAPE_START = 0.6;
const SNAP_RAD = 0.06; // smaller tilts are drawn square, so the pixels stay crisp
const DROP_START_GAP = 2; // a dropping item starts this many px above the stage

/**
 * Where the box sits on the stage, in art px.
 * @param {import('./pixel-canvas.js').PixelView} view
 * @param {import('./placeholder-box.js').BoxArt} box
 */
export function stageLayout(view, box) {
  const boxX = Math.round(view.artW / 2 - box.w / 2);
  const room = Math.ceil(CAPTION_ROOM_CSS / view.cssPerArt);
  const boxY = Math.max(2, view.artH - box.h - room);
  return Object.freeze({ boxX, boxY });
}

/**
 * Lid phase progress split into closing the lid and laying the tape.
 * @param {number} lid 0..1
 */
export function lidParts(lid) {
  return {
    close: clamp(lid / LID_CLOSE_END, 0, 1),
    tape: clamp((lid - TAPE_START) / (1 - TAPE_START), 0, 1),
  };
}

/**
 * Items in painter's order: the recording's packing order (back to front).
 * @param {{ order?: number[], laneOf: Int8Array }} rec
 * @param {Array<{ depth: number }>} lanes
 */
export function drawOrder(rec, lanes) {
  if (Array.isArray(rec.order)) return [...rec.order];
  return [...Array(rec.laneOf.length).keys()].sort(
    (a, b) => lanes[rec.laneOf[a]].depth - lanes[rec.laneOf[b]].depth || a - b,
  );
}

const snapAngle = (a) => (Math.abs(a) < SNAP_RAD ? 0 : a);

// Quarter turns by moving whole pixels, so a lying item is as crisp as a standing one.
function turnSprite(image, w, h, turn) {
  if (!turn) return image;
  const src = pixelsOf(image, w, h);
  const [tw, th] = turn % 2 ? [h, w] : [w, h];
  const { canvas, ctx } = makeCanvas(tw, th);
  const out = ctx.createImageData(tw, th);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // pixel (x, y) covers the edge square (x, y)-(x + 1, y + 1); its turned top-left corner:
      const [ax, ay] = turnPoint(x, y, w, h, turn);
      const [bx, by] = turnPoint(x + 1, y + 1, w, h, turn);
      const o = (y * w + x) * 4;
      out.data.set(src.subarray(o, o + 4), (Math.min(ay, by) * tw + Math.min(ax, bx)) * 4);
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

const turned = new WeakMap();

// The packed view when the plan gives one (box.packing[].view), else the item's own icon.
function spriteFor(scene, i, dark) {
  const view = scene.rec.views && scene.rec.views[i];
  const source = view || scene.items[i];
  let cache = turned.get(source);
  if (!cache) {
    cache = {};
    turned.set(source, cache);
  }
  const key = dark && source.imageDark ? 'dark' : 'light';
  if (!cache[key]) cache[key] = turnSprite(spriteOf(source, dark), source.w, source.h, scene.rec.turn ? scene.rec.turn[i] : 0);
  return cache[key];
}

/**
 * The item layer and its mask for one stage size and box position.
 * @param {number} artW
 * @param {number} artH
 * @param {any} box
 * @param {{ boxX: number, boxY: number }} layout
 */
export function createItemLayer(artW, artH, box, layout) {
  const layer = makeCanvas(artW, artH);
  const mask = makeCanvas(artW, artH);
  if (box.swallow) {
    paintMouthMask(mask.ctx, artW, box, layout);
    return { layer, mask: mask.canvas };
  }
  const [l, m, r] = box.lowerOutline.map(([x, y]) => [x + layout.boxX, y + layout.boxY]);
  fillPolygon(
    mask.ctx,
    [[-1, -1], [artW + 1, -1], [artW + 1, r[1]], r, m, l, [-1, l[1]]],
    '#fff',
  );
  return { layer, mask: mask.canvas };
}

// Bottomless box geometry in stage pixels: the rim plane at the middle depth (the corner row)
// and the opening's front corner.
function mouthOf(box, layout) {
  const n = (box.frontRimY - box.rimTopY) / 2;
  return {
    cx: layout.boxX + box.floor.x + box.floor.w / 2,
    top: layout.boxY + box.rimTopY,
    cut: layout.boxY + box.rimTopY + n,
    front: layout.boxY + box.frontRimY,
    n,
  };
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const MOUTH_FADE = 0.8; // share of the opening's front half over which an item dissolves

// Above the rim plane an item shows whole; below it, only through the opening, dissolving in an
// ordered dither as it sinks, so it vanishes into the void in crisp pixels.
function paintMouthMask(ctx, artW, box, layout) {
  const m = mouthOf(box, layout);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, artW, Math.max(0, Math.floor(m.cut)));
  const fade = Math.max(1, m.n * MOUTH_FADE);
  for (let y = Math.floor(m.cut); y < m.front; y++) {
    const half = 2 * (m.front - (y + 0.5));
    const sink = (y + 0.5 - m.cut) / fade;
    for (let x = Math.ceil(m.cx - half); x < m.cx + half; x++) {
      if (BAYER4[(y & 3) * 4 + (x & 3)] / 16 >= sink) ctx.fillRect(x, y, 1, 1);
    }
  }
}

// ------------------------------------------------------------------ the void

const STAR = Object.freeze({ count: 18, tickMs: 140, bright: '#ffffff', mid: '#b9a8ff', faint: '#4b3f9c' });
const starCache = new WeakMap();

function starsOf(box) {
  let stars = starCache.get(box);
  if (stars) return stars;
  const rand = mulberry32(20261023);
  const n = (box.frontRimY - box.rimTopY) / 2;
  const cx = box.floor.x + box.floor.w / 2;
  stars = [];
  while (stars.length < STAR.count) {
    const x = Math.round(cx + (rand() * 2 - 1) * 2 * n);
    const y = Math.round(box.rimTopY + rand() * 2 * n);
    const d = Math.abs(x + 0.5 - cx) / 2;
    if (y < box.rimTopY + d + 6 || y > box.frontRimY - d - 3) continue;
    stars.push({ x, y, period: 7 + Math.floor(rand() * 14), phase: Math.floor(rand() * 20), big: rand() < 0.22 });
  }
  starCache.set(box, stars);
  return stars;
}

function drawStars(ctx, box, layout, clock) {
  const tick = Math.floor(clock / STAR.tickMs);
  starsOf(box).forEach((s) => {
    const k = (tick + s.phase) % s.period;
    const level = k === 0 ? 2 : k === 1 || k === s.period - 1 ? 1 : 0;
    const x = layout.boxX + s.x;
    const y = layout.boxY + s.y;
    ctx.fillStyle = level === 2 ? STAR.bright : level === 1 ? STAR.mid : STAR.faint;
    ctx.fillRect(x, y, 1, 1);
    if (s.big && level === 2) {
      ctx.fillStyle = STAR.mid;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => ctx.fillRect(x + dx, y + dy, 1, 1));
    }
  });
}

const RIPPLE = Object.freeze({ frames: 20, lead: 2, colours: ['#ffffff', '#d9ccff', '#9d86ff', '#5d4bc4'] });

// A ring of light spreads over the opening when an item has gone through it.
function drawRipples(ctx, scene, layout, frame) {
  const m = mouthOf(scene.box, layout);
  scene.order.forEach((i) => {
    const t = frame - scene.rec.landFrame[i] + RIPPLE.lead;
    if (t < 0 || t >= RIPPLE.frames) return;
    const u = t / RIPPLE.frames;
    const cx = layout.boxX + scene.rec.rest[i][0] + scene.rec.size[i][0] / 2;
    const rx = 6 + 44 * u;
    const steps = Math.max(24, Math.round(rx * 3));
    ctx.fillStyle = RIPPLE.colours[Math.min(RIPPLE.colours.length - 1, Math.floor(u * RIPPLE.colours.length))];
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const x = Math.round(cx + rx * Math.cos(a));
      const y = Math.round(m.cut + (rx / 2) * Math.sin(a));
      const d = Math.abs(x + 0.5 - m.cx) / 2;
      if (y + 0.5 > m.top + d && y + 0.5 < m.front - d) ctx.fillRect(x, y, 1, 1);
    }
  });
}

// A dropping item starts with its bottom just above the stage, whatever the screen height.
function dropLift(rec, i, boxY) {
  return boxY + rec.rest[i][1] + rec.size[i][1] + DROP_START_GAP;
}

function drawItems(ctx, scene, frame, x0, y0) {
  const dark = currentTheme() === 'dark';
  scene.order.forEach((i) => {
    const pose = poseAt(scene.rec, frame, i);
    const [w, h] = scene.rec.size[i];
    const lift = pose.fall * dropLift(scene.rec, i, y0);
    const cy = y0 + pose.y - lift;
    if (cy + h / 2 < 0) return; // still above the stage
    const sprite = spriteFor(scene, i, dark);
    const a = snapAngle(pose.a);
    if (a === 0) {
      ctx.drawImage(sprite, Math.round(x0 + pose.x - w / 2), Math.round(cy - h / 2));
      return;
    }
    ctx.save();
    ctx.translate(Math.round(x0 + pose.x), Math.round(cy));
    ctx.rotate(a);
    ctx.drawImage(sprite, -Math.round(w / 2), -Math.round(h / 2));
    ctx.restore();
  });
}

/**
 * Draw the drop and lid phases.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ box: any, items: any[], rec: any, order: number[] }} scene
 * @param {{ boxX: number, boxY: number }} layout
 * @param {{ layer: { canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }, mask: HTMLCanvasElement }} items
 * @param {number} frame fractional recorded frame
 * @param {number} lid 0..1
 * @param {number} [clock] ms, for the void's twinkling stars
 */
export function drawKitFrame(ctx, scene, layout, items, frame, lid, clock = 0) {
  const { box } = scene;
  const { boxX, boxY } = layout;
  const parts = lidParts(lid);
  ctx.imageSmoothingEnabled = false;
  if (box.isClosed(parts.close)) {
    box.drawClosed(ctx, boxX, boxY, parts.tape);
    return;
  }
  box.drawBack(ctx, boxX, boxY, parts.close);
  if (scene.rec.swallow) {
    drawStars(ctx, box, layout, clock);
    drawRipples(ctx, scene, layout, frame);
  }
  const lctx = items.layer.ctx;
  lctx.imageSmoothingEnabled = false;
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, items.layer.canvas.width, items.layer.canvas.height);
  drawItems(lctx, scene, frame, boxX, boxY);
  lctx.globalCompositeOperation = 'destination-in';
  lctx.drawImage(items.mask, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(items.layer.canvas, 0, 0);
  box.drawFront(ctx, boxX, boxY, parts.close);
}
