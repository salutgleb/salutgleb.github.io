// Placeholder studio until manifest-studio.json arrives: an isometric slab, a camera on a tripod,
// the operator behind it, the expert in a chair, a softbox, a monitor and a blinking REC dot.

import { PAL } from './palette.js';
import { fillPolygon, rect, line, dot } from './draw.js';

export const PLACEHOLDER_STUDIO = Object.freeze({ w: 200, h: 140, safe: { x: 40, y: 20, w: 120, h: 112 } });

const MOUTH = Object.freeze([0, 1, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0]); // 110 ms steps, with holds

function slab(ctx, x, y) {
  const T = [x + 100, y + 40];
  const L = [x + 10, y + 85];
  const R = [x + 190, y + 85];
  const B = [x + 100, y + 130];
  fillPolygon(ctx, [L, B, [B[0], B[1] + 6], [L[0], L[1] + 6]], PAL.grey3);
  fillPolygon(ctx, [B, R, [R[0], R[1] + 6], [B[0], B[1] + 6]], PAL.grey2);
  fillPolygon(ctx, [T, R, B, L], PAL.grey1);
  line(ctx, L[0], L[1], T[0] - 1, T[1], PAL.ink);
  line(ctx, T[0], T[1], R[0] - 1, R[1] - 1, PAL.ink);
  // back walls
  fillPolygon(ctx, [[L[0], L[1] - 52], [T[0], T[1] - 52], T, L], PAL.white);
  fillPolygon(ctx, [[T[0], T[1] - 52], [R[0], R[1] - 52], R, T], PAL.grey1);
  rect(ctx, T[0], T[1] - 52, 1, 52, PAL.grey2);
  line(ctx, L[0], L[1] - 52, T[0] - 1, T[1] - 52, PAL.ink);
  line(ctx, T[0], T[1] - 52, R[0] - 1, R[1] - 53, PAL.ink);
  rect(ctx, L[0], L[1] - 52, 1, 52, PAL.ink);
  rect(ctx, R[0] - 1, R[1] - 53, 1, 53, PAL.ink);
}

function softbox(ctx, x, y) {
  fillPolygon(ctx, [[x, y], [x + 22, y - 6], [x + 22, y + 16], [x, y + 22]], PAL.white);
  line(ctx, x, y, x + 21, y - 6, PAL.ink);
  line(ctx, x, y + 22, x + 21, y + 16, PAL.ink);
  rect(ctx, x, y, 1, 22, PAL.ink);
  rect(ctx, x + 10, y + 19, 2, 30, PAL.grey3);
  line(ctx, x + 11, y + 48, x + 4, y + 54, PAL.grey3);
  line(ctx, x + 11, y + 48, x + 18, y + 54, PAL.grey3);
}

function person(ctx, x, y, { seated, mouth, lean }) {
  const o = lean;
  rect(ctx, x + 2 + o, y, 8, 8, PAL.ink); // hair
  rect(ctx, x + 3 + o, y + 3, 6, 6, PAL.skin);
  rect(ctx, x + 3 + o, y + 3, 6, 1, PAL.ink);
  if (mouth > 0) rect(ctx, x + 5 + o, y + 7, 2, mouth === 2 ? 2 : 1, PAL.redShade);
  rect(ctx, x + 1, y + 9, 10, 11, PAL.white);
  rect(ctx, x + 1, y + 9, 1, 11, PAL.grey1);
  if (seated) {
    rect(ctx, x + 1, y + 20, 12, 4, PAL.grey3);
    rect(ctx, x + 11, y + 20, 2, 9, PAL.grey3);
    rect(ctx, x + 11, y + 28, 4, 2, PAL.ink);
  } else {
    rect(ctx, x + 2, y + 20, 3, 11, PAL.grey3);
    rect(ctx, x + 7, y + 20, 3, 11, PAL.grey3);
    rect(ctx, x + 1, y + 30, 5, 2, PAL.ink);
    rect(ctx, x + 7, y + 30, 5, 2, PAL.ink);
  }
}

function chair(ctx, x, y) {
  rect(ctx, x, y + 18, 16, 3, PAL.ink);
  rect(ctx, x + 1, y + 21, 2, 9, PAL.ink);
  rect(ctx, x + 13, y + 21, 2, 9, PAL.ink);
  rect(ctx, x - 1, y + 6, 3, 14, PAL.ink);
}

function cameraRig(ctx, x, y, recOn) {
  rect(ctx, x, y, 14, 9, PAL.grey3);
  rect(ctx, x, y, 14, 1, PAL.grey2);
  rect(ctx, x + 14, y + 2, 5, 5, PAL.ink);
  rect(ctx, x + 2, y - 3, 6, 3, PAL.grey3);
  if (recOn) dot(ctx, x + 2, y + 2, PAL.red);
  rect(ctx, x + 6, y + 9, 2, 20, PAL.grey3);
  line(ctx, x + 7, y + 28, x, y + 36, PAL.grey3);
  line(ctx, x + 7, y + 28, x + 14, y + 36, PAL.grey3);
  line(ctx, x + 7, y + 28, x + 7, y + 37, PAL.ink);
}

function monitor(ctx, x, y, mouth) {
  rect(ctx, x, y, 18, 13, PAL.ink);
  rect(ctx, x + 1, y + 1, 16, 11, PAL.blue);
  rect(ctx, x + 7, y + 3, 4, 4, PAL.skin);
  rect(ctx, x + 7, y + 2, 4, 1, PAL.ink);
  rect(ctx, x + 6, y + 7, 6, 5, PAL.white);
  if (mouth > 0) dot(ctx, x + 9, y + 6, PAL.redShade);
  rect(ctx, x + 8, y + 13, 2, 14, PAL.grey3);
  rect(ctx, x + 5, y + 26, 8, 2, PAL.ink);
}

/**
 * Draw the placeholder studio at (x, y) for time t.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} t ms
 */
export function drawPlaceholderStudio(ctx, x, y, t) {
  const mouth = MOUTH[Math.floor(t / 110) % MOUTH.length];
  const recOn = Math.floor(t / 500) % 2 === 0;
  const lean = Math.floor(t / 800) % 4 === 3 ? 1 : 0;
  slab(ctx, x, y);
  softbox(ctx, x + 36, y + 38);
  monitor(ctx, x + 146, y + 52, mouth);
  chair(ctx, x + 118, y + 62);
  person(ctx, x + 120, y + 52, { seated: true, mouth, lean: 0 });
  cameraRig(ctx, x + 74, y + 66, recOn);
  person(ctx, x + 58, y + 64, { seated: false, mouth: 0, lean });
}
