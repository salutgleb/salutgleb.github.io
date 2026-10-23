// The box artist's sprites (manifest-items.json "box"), behind the same BoxArt interface as the
// placeholder box: back and front layers around the items, a lid strip, closed box and tape.

import { assetUrl, loadImage, pixelsOf, warn } from './assets.js';
import { makeCanvas } from './draw.js';

const TAPE_STEPS = 24; // the tape is laid in this many visible steps

const point = (p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : p && [Number(p.x), Number(p.y)]);

/**
 * @param {any} manifest parsed manifest-items.json or null
 * @returns {Promise<import('./placeholder-box.js').BoxArt|null>}
 */
export async function loadBox(manifest) {
  const raw = manifest && manifest.box;
  if (!raw || !raw.layers) return null;
  const files = [
    raw.layers.back,
    raw.layers.front,
    raw.layers.closed,
    raw.layers.tape,
    raw.lid && raw.lid.back,
    raw.lid && raw.lid.front,
    raw.layers.shadow,
  ];
  const [back, front, closed, tape, lidBack, lidFront, shadow] = await Promise.all(
    files.map((f) => (f ? loadImage(assetUrl(f)) : Promise.resolve(null))),
  );
  const read = readGeometry(raw);
  if (!back || !front || !closed || !read) {
    warn('box sprites or geometry incomplete, using the placeholder box');
    return null;
  }
  const packing = await loadPackingViews(read.floor.packing);
  const swallow = Boolean(raw.swallow);
  const geometry = { ...read, floor: Object.freeze({ ...read.floor, packing, swallow }) };
  const w = Number(raw.w) || back.naturalWidth;
  const h = Number(raw.h) || back.naturalHeight;
  const lid = lidBack && lidFront ? readLid(raw.lid, w, h) : null;
  const tapeFrames = tape ? buildTapeFrames(tape, w, h, geometry.centre) : [];

  const lidFrame = (closeP) => {
    if (!lid) return 0;
    if (closeP >= 1) return lid.frames - 1;
    return Math.min(lid.frames - 2, Math.floor(closeP * (lid.frames - 1)));
  };
  const drawLayer = (ctx, image, strip, x, y, closeP) => {
    const f = lidFrame(closeP);
    if (!lid || f === 0) ctx.drawImage(image, x, y);
    else ctx.drawImage(strip, f * lid.frameW, 0, lid.frameW, lid.frameH, x, y, lid.frameW, lid.frameH);
  };
  const drawSealed = (ctx, x, y, tapeP) => {
    ctx.drawImage(closed, x, y);
    if (!tapeFrames.length || tapeP <= 0) return;
    const i = Math.min(tapeFrames.length - 1, Math.round(tapeP * (tapeFrames.length - 1)));
    ctx.drawImage(tapeFrames[i], x, y);
  };
  // The artist's shadow assumed a crimson ground; it is redrawn as a neutral tint of the theme.
  let tinted = null;
  const setShadowColor = (color) => {
    tinted = shadow ? tintImage(shadow, w, h, color) : null;
  };
  setShadowColor('rgba(20, 19, 16, 0.2)');
  const drawShadow = (ctx, x, y) => {
    if (tinted) ctx.drawImage(tinted, x, y);
  };
  const drawClosed = (ctx, x, y, tapeP) => {
    drawShadow(ctx, x, y);
    drawSealed(ctx, x, y, tapeP);
  };

  let closedCache = null;
  const anchorY = Number(raw.anchor && raw.anchor.y);
  return Object.freeze({
    w,
    h,
    captions: readCaptions(manifest.items),
    swallow, // bottomless: items fall through the opening into the void
    groundY: Number.isFinite(anchorY) ? anchorY : h - 2,
    frontRimY: geometry.frontRimY,
    lowerOutline: lowerOutline(geometry, Number.isFinite(anchorY) ? anchorY : h - 2),
    rimTopY: geometry.rimTopY,
    floor: geometry.floor,
    drawBack: (ctx, x, y, closeP) => {
      drawShadow(ctx, x, y);
      drawLayer(ctx, back, lidBack, x, y, closeP);
    },
    drawFront: (ctx, x, y, closeP) => drawLayer(ctx, front, lidFront, x, y, closeP),
    isClosed: (closeP) => (lid ? lidFrame(closeP) >= lid.frames - 1 : closeP >= 1),
    setShadowColor,
    drawClosed,
    // Without the ground shadow: only the box itself bursts into pixels.
    closedSprite() {
      if (!closedCache) {
        const { canvas, ctx } = makeCanvas(w, h);
        drawSealed(ctx, 0, 0, 1);
        closedCache = canvas;
      }
      return closedCache;
    },
  });
}

// Floor rhombus bounds for the depth lanes. Accepts the opening as rows and columns
// ({ topRow, bottomRow, leftCol, rightCol }) or as four points, and the inner walls either as
// "floor" { x, y, w, h } in the corner plane (floor surface at y + h) or as innerWalls.
function readGeometry(raw) {
  const opening = readOpening(raw.opening || {});
  if (!opening) return null;
  const f = raw.floor || {};
  const walls = raw.innerWalls || {};
  const finite = (...values) => values.every((v) => Number.isFinite(Number(v)));
  let left;
  let right;
  let floorY;
  if (finite(f.x, f.y, f.w, f.h)) {
    left = Number(f.x);
    right = Number(f.x) + Number(f.w);
    floorY = Number(f.y) + Number(f.h);
  } else if (finite(walls.left, walls.right, walls.floor)) {
    left = Number(walls.left);
    right = Number(walls.right);
    floorY = Number(walls.floor);
  } else {
    return null;
  }
  const depth = opening.bottom - opening.top;
  return {
    rimTopY: opening.top,
    frontRimY: opening.bottom,
    openingLeft: opening.left,
    openingRight: opening.right,
    centre: [(opening.left + opening.right) / 2, (opening.top + opening.bottom) / 2],
    // The packing plan travels with the floor: buildLanes() hands it on to recordKit().
    floor: Object.freeze({ x: left, y: floorY - depth / 2, w: right - left, h: depth, packing: readPacking(raw.packing) }),
  };
}

// What the stage shows while an item falls (manifest items[].caption), by item id. Read here
// because the item loader keeps only what the sprites need.
function readCaptions(items) {
  const list = Array.isArray(items) ? items : [];
  return new Map(list.filter((it) => it && it.id && typeof it.caption === 'string').map((it) => [String(it.id), it.caption]));
}

// Final poses of the packed kit, back to front: { id, x, y, turn } in box layer pixels, and
// optionally view: { file, fileDark, w, h, hull }, the sprite the box shows instead of the icon.
function readPacking(list) {
  if (!Array.isArray(list)) return Object.freeze([]);
  const poses = list
    .filter((p) => p && typeof p.id === 'string' && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
    .map((p) => Object.freeze({ id: p.id, x: Number(p.x), y: Number(p.y), turn: Number(p.turn) || 0, view: readView(p.view) }));
  if (poses.length < list.length) warn('box.packing has entries without id, x or y; they are skipped');
  return Object.freeze(poses);
}

function readView(v) {
  if (!v || typeof v.file !== 'string') return null;
  const w = Math.round(Number(v.w));
  const h = Math.round(Number(v.h));
  if (!(w > 0 && h > 0)) return null;
  const hull = Array.isArray(v.hull) && v.hull.length >= 3 ? v.hull.map((q) => [Number(q[0]), Number(q[1])]) : null;
  return { file: v.file, fileDark: typeof v.fileDark === 'string' ? v.fileDark : null, w, h, hull };
}

// Loads each pose's view; a view whose sprite is missing is dropped, so the icon shows instead.
async function loadPackingViews(poses) {
  const loaded = await Promise.all(
    poses.map(async (pose) => {
      if (!pose.view) return pose;
      const [image, imageDark] = await Promise.all([
        loadImage(assetUrl(pose.view.file)),
        pose.view.fileDark ? loadImage(assetUrl(pose.view.fileDark)) : null,
      ]);
      if (!image) {
        warn(`packing view for ${pose.id} is missing, the box shows its icon`);
        return Object.freeze({ ...pose, view: null });
      }
      return Object.freeze({ ...pose, view: Object.freeze({ ...pose.view, image, imageDark }) });
    }),
  );
  return Object.freeze(loaded);
}

function readOpening(o) {
  const nums = [o.topRow, o.bottomRow, o.leftCol, o.rightCol].map(Number);
  if (nums.every(Number.isFinite)) {
    const [topRow, bottomRow, leftCol, rightCol] = nums;
    return { top: topRow, bottom: bottomRow + 1, left: leftCol, right: rightCol + 1 };
  }
  const pts = [o.top, o.bottom, o.left, o.right].map(point);
  if (!pts.every((p) => p && p.every(Number.isFinite))) return null;
  return { top: pts[0][1], bottom: pts[1][1], left: pts[2][0], right: pts[3][0] };
}

// Bottom edges of the two front faces, left corner to front vertex to right corner (2:1).
function lowerOutline(geometry, groundY) {
  const left = geometry.openingLeft;
  const right = geometry.openingRight;
  const mid = (left + right) / 2;
  const cornerY = groundY - (right - left) / 4;
  return Object.freeze([
    [left, cornerY],
    [mid, groundY],
    [right, cornerY],
  ]);
}

function tintImage(image, w, h, color) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

function readLid(lid, w, h) {
  const frames = Math.max(2, Math.round(Number(lid.frames) || 2));
  return { frames, frameW: Number(lid.frameW) || w, frameH: Number(lid.frameH) || h };
}

// The tape is a cross along the two iso axes. Each tape pixel gets a moment along its strip:
// the first strip is laid back to front (and down its face), then the second one.
function buildTapeFrames(tape, w, h, centre) {
  const data = pixelsOf(tape, w, h);
  const axes = [
    [2 / Math.sqrt(5), 1 / Math.sqrt(5)],
    [-2 / Math.sqrt(5), 1 / Math.sqrt(5)],
  ];
  const pixels = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (data[o + 3] < 128) continue;
      const rx = x + 0.5 - centre[0];
      const ry = y + 0.5 - centre[1];
      const off = axes.map(([ax, ay]) => Math.abs(rx * ay - ry * ax));
      const strip = off[0] <= off[1] ? 0 : 1;
      const along = rx * axes[strip][0] + ry * axes[strip][1];
      pixels.push({ x, y, strip, along, rgba: data.slice(o, o + 4) });
    }
  }
  const range = [0, 1].map((s) => {
    const list = pixels.filter((p) => p.strip === s).map((p) => p.along);
    return list.length ? [Math.min(...list), Math.max(...list)] : [0, 1];
  });
  const moment = (p) => {
    const [lo, hi] = range[p.strip];
    return p.strip * 0.5 + 0.5 * ((p.along - lo) / Math.max(1e-6, hi - lo));
  };
  return Array.from({ length: TAPE_STEPS + 1 }, (_, step) => {
    const { canvas, ctx } = makeCanvas(w, h);
    const image = ctx.createImageData(w, h);
    pixels.forEach((p) => {
      if (moment(p) <= step / TAPE_STEPS + 1e-9) image.data.set(p.rgba, (p.y * w + p.x) * 4);
    });
    ctx.putImageData(image, 0, 0);
    return canvas;
  });
}
