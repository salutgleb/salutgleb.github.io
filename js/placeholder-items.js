// Placeholder kit icons drawn from palette rectangles. Used when a sprite is not delivered yet.

import { PAL } from './palette.js';
import { makeCanvas, rect, dot, line } from './draw.js';

function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r + r * 0.6) ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}

function camera(ctx) {
  rect(ctx, 12, 5, 16, 7, PAL.grey3);
  rect(ctx, 13, 5, 14, 1, PAL.grey2);
  rect(ctx, 3, 11, 50, 28, PAL.grey3);
  rect(ctx, 3, 11, 50, 1, PAL.grey2);
  rect(ctx, 42, 11, 11, 28, PAL.ink);
  rect(ctx, 43, 12, 1, 26, PAL.grey3);
  rect(ctx, 46, 9, 4, 2, PAL.red);
  rect(ctx, 3, 38, 50, 1, PAL.ink);
  disc(ctx, 22, 25, 12, PAL.grey2);
  disc(ctx, 22, 25, 10, PAL.ink);
  disc(ctx, 22, 25, 7, PAL.grey3);
  disc(ctx, 22, 25, 4, PAL.ink);
  rect(ctx, 18, 21, 3, 2, PAL.blue);
  dot(ctx, 21, 23, PAL.blueShade);
}

function light(ctx) {
  disc(ctx, 22, 19, 18, PAL.grey3);
  disc(ctx, 22, 19, 16, PAL.grey1);
  disc(ctx, 22, 19, 14, PAL.white);
  line(ctx, 22, 6, 22, 32, PAL.grey1);
  line(ctx, 9, 19, 35, 19, PAL.grey1);
  disc(ctx, 22, 19, 3, PAL.grey1);
  rect(ctx, 21, 37, 3, 18, PAL.grey2);
  rect(ctx, 19, 37, 7, 3, PAL.grey3);
  line(ctx, 22, 54, 10, 61, PAL.grey2);
  line(ctx, 22, 54, 34, 61, PAL.grey2);
  rect(ctx, 21, 54, 3, 8, PAL.grey3);
}

function iphone(ctx) {
  rect(ctx, 2, 1, 26, 56, PAL.blueShade);
  rect(ctx, 1, 2, 28, 54, PAL.blueShade);
  rect(ctx, 2, 2, 1, 53, PAL.blue);
  rect(ctx, 2, 3, 26, 14, PAL.blue);
  disc(ctx, 9, 8, 3, PAL.ink);
  disc(ctx, 9, 8, 1, PAL.grey3);
  disc(ctx, 9, 14, 2, PAL.ink);
  disc(ctx, 17, 11, 3, PAL.ink);
  disc(ctx, 17, 11, 1, PAL.grey3);
  dot(ctx, 24, 6, PAL.white);
  rect(ctx, 13, 32, 4, 5, PAL.blue);
}

function mic(ctx) {
  rect(ctx, 3, 18, 16, 15, PAL.grey3);
  rect(ctx, 3, 18, 16, 1, PAL.grey2);
  dot(ctx, 15, 21, PAL.red);
  rect(ctx, 7, 25, 8, 1, PAL.ink);
  rect(ctx, 7, 27, 8, 1, PAL.ink);
  disc(ctx, 6, 4, 3, PAL.ink);
  rect(ctx, 5, 7, 3, 3, PAL.grey2);
  line(ctx, 6, 10, 6, 14, PAL.ink);
  line(ctx, 6, 14, 10, 18, PAL.ink);
}

function tripod(ctx) {
  rect(ctx, 9, 0, 12, 5, PAL.grey3);
  rect(ctx, 9, 0, 12, 1, PAL.grey2);
  rect(ctx, 20, 2, 8, 2, PAL.grey2);
  rect(ctx, 13, 5, 4, 26, PAL.grey2);
  rect(ctx, 14, 5, 1, 26, PAL.grey1);
  line(ctx, 14, 31, 3, 63, PAL.grey3);
  line(ctx, 15, 31, 4, 63, PAL.grey2);
  line(ctx, 15, 31, 26, 63, PAL.grey3);
  line(ctx, 16, 31, 27, 63, PAL.grey2);
  rect(ctx, 14, 31, 2, 32, PAL.grey3);
}

function sdCard(ctx) {
  rect(ctx, 1, 4, 20, 23, PAL.ink);
  rect(ctx, 1, 0, 15, 4, PAL.ink);
  rect(ctx, 2, 1, 1, 25, PAL.grey3);
  rect(ctx, 3, 12, 16, 9, PAL.accent);
  rect(ctx, 3, 12, 16, 1, PAL.skin);
  [4, 7, 10, 13].forEach((x) => rect(ctx, x, 1, 2, 4, PAL.grey1));
}

function headphones(ctx) {
  rect(ctx, 8, 2, 24, 3, PAL.ink);
  rect(ctx, 5, 4, 4, 3, PAL.ink);
  rect(ctx, 31, 4, 4, 3, PAL.ink);
  rect(ctx, 3, 7, 4, 10, PAL.ink);
  rect(ctx, 33, 7, 4, 10, PAL.ink);
  rect(ctx, 9, 2, 22, 1, PAL.grey2);
  rect(ctx, 0, 16, 11, 18, PAL.grey3);
  rect(ctx, 29, 16, 11, 18, PAL.grey3);
  rect(ctx, 0, 16, 11, 1, PAL.grey2);
  rect(ctx, 29, 16, 11, 1, PAL.grey2);
  rect(ctx, 8, 18, 3, 14, PAL.grey1);
  rect(ctx, 29, 18, 3, 14, PAL.grey1);
}

const PAINTERS = Object.freeze({
  camera: { w: 56, h: 40, paint: camera },
  light: { w: 44, h: 62, paint: light },
  iphone: { w: 30, h: 58, paint: iphone },
  mic: { w: 22, h: 34, paint: mic },
  tripod: { w: 30, h: 64, paint: tripod },
  sd: { w: 22, h: 28, paint: sdCard },
  headphones: { w: 40, h: 34, paint: headphones },
});

// Fallback kit when manifest-items.json is missing: the same six items in the same order.
export const DEFAULT_ITEMS = Object.freeze([
  { id: 'camera', label: 'Sony FX30' },
  { id: 'light', label: 'Aputure с LightDome II' },
  { id: 'iphone', label: 'iPhone 18 Pro Max' },
  { id: 'mic', label: 'DJI Mic' },
  { id: 'gimbal', label: 'Стабилизатор DJI RS' },
  { id: 'tripod', label: 'Штатив' },
]);

/**
 * Placeholder sprite for an item id. Unknown ids get a plain labelled crate.
 * @param {string} id
 * @param {number} [w]
 * @param {number} [h]
 * @returns {{ image: HTMLCanvasElement, w: number, h: number }}
 */
export function placeholderItem(id, w, h) {
  const known = PAINTERS[id];
  if (known && (!w || !h || (w === known.w && h === known.h))) {
    const { canvas, ctx } = makeCanvas(known.w, known.h);
    known.paint(ctx);
    return { image: canvas, w: known.w, h: known.h };
  }
  const width = Math.max(12, Math.round(w || 36));
  const height = Math.max(12, Math.round(h || 30));
  const { canvas, ctx } = makeCanvas(width, height);
  rect(ctx, 0, 0, width, height, PAL.grey3);
  rect(ctx, 1, 1, width - 2, height - 2, PAL.grey2);
  rect(ctx, 1, 1, width - 2, 1, PAL.grey1);
  rect(ctx, 3, Math.floor(height / 2) - 1, width - 6, 2, PAL.grey3);
  return { image: canvas, w: width, h: height };
}
