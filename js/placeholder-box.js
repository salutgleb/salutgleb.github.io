// Procedural isometric cardboard box (2:1, light from the upper right, REVERSE.md B6), used until
// the box artist's sprites arrive. It implements the same BoxArt interface as the sprite box.

import { PAL } from './palette.js';
import { makeCanvas, fillPolygon, line, rect } from './draw.js';
import { add, mid, scaleVec, offsetPoly } from './geometry.js';
import { clamp, easeInOutCubic } from './util.js';

/**
 * @typedef {Object} BoxArt
 * @property {number} w frame width in art px
 * @property {number} h frame height in art px
 * @property {{x:number,y:number,w:number,h:number}} floor inner floor rhombus bounds, frame coords
 * @property {number} rimTopY top vertex of the opening, frame coords
 * @property {(ctx: CanvasRenderingContext2D, x: number, y: number, closeP: number) => void} drawBack
 * @property {(ctx: CanvasRenderingContext2D, x: number, y: number, closeP: number) => void} drawFront
 * @property {(ctx: CanvasRenderingContext2D, x: number, y: number, tapeP: number) => void} drawClosed
 * @property {() => HTMLCanvasElement} closedSprite shut and taped, frame-sized
 */

const HW = 48; // half width of the top rhombus
const HH = 24; // half height (2:1)
const WALL = 34;
const FLAP_UP = 26; // screen height of a standing flap
const PAD_X = 22;
const PAD_TOP = 28;
const OPEN_DEG = 150; // flaps lie open, slightly raised, in an X

const T = [PAD_X + HW, PAD_TOP];
const L = [PAD_X, PAD_TOP + HH];
const R = [PAD_X + 2 * HW, PAD_TOP + HH];
const B = [PAD_X + HW, PAD_TOP + 2 * HH];
const C = mid(L, R);
const down = (p, d = WALL) => [p[0], p[1] + d];

// Each flap hinges on one rim edge; `inward` points from the edge to the middle of the top.
const FLAPS = Object.freeze({
  tl: { p0: L, p1: T, inward: [HW / 2, HH / 2], lit: true },
  tr: { p0: T, p1: R, inward: [-HW / 2, HH / 2], lit: false },
  lb: { p0: L, p1: B, inward: [HW / 2, -HH / 2], lit: false },
  br: { p0: B, p1: R, inward: [-HW / 2, -HH / 2], lit: true },
});

// First pair folds in, then the second pair closes on top and meets at the seam.
function flapAngles(closeP) {
  const first = easeInOutCubic(clamp(closeP / 0.55, 0, 1));
  const second = easeInOutCubic(clamp((closeP - 0.45) / 0.55, 0, 1));
  return {
    tr: OPEN_DEG * (1 - first),
    lb: OPEN_DEG * (1 - first),
    tl: OPEN_DEG * (1 - second),
    br: OPEN_DEG * (1 - second),
  };
}

function flapPolygon(flap, deg) {
  const rad = (deg * Math.PI) / 180;
  const v = add(scaleVec(flap.inward, Math.cos(rad)), [0, -FLAP_UP * Math.sin(rad)]);
  return [flap.p0, flap.p1, add(flap.p1, v), add(flap.p0, v)];
}

function drawFlap(ctx, ox, oy, flap, deg) {
  const poly = offsetPoly(flapPolygon(flap, deg), ox, oy);
  const flat = Math.abs(Math.cos((deg * Math.PI) / 180)) >= 0.5;
  fillPolygon(ctx, poly, flat || flap.lit ? PAL.cardLit : PAL.cardShade);
  const [p0, p1, p2, p3] = poly;
  line(ctx, p1[0], p1[1], p2[0], p2[1], PAL.cardLine);
  line(ctx, p2[0], p2[1], p3[0], p3[1], PAL.cardLine);
  line(ctx, p3[0], p3[1], p0[0], p0[1], PAL.cardLine);
  line(ctx, p0[0], p0[1], p1[0], p1[1], PAL.cardShade);
}

function drawFaces(ctx, ox, oy) {
  const o = (pts) => offsetPoly(pts, ox, oy);
  fillPolygon(ctx, o([L, B, down(B), down(L)]), PAL.cardShade);
  fillPolygon(ctx, o([B, R, down(R), down(B)]), PAL.cardLit);
  const [lx, ly] = [L[0] + ox, L[1] + oy];
  const [bx, by] = [B[0] + ox, B[1] + oy];
  const [rx, ry] = [R[0] + ox, R[1] + oy];
  line(ctx, lx, ly, lx, ly + WALL, PAL.cardLine);
  line(ctx, rx - 1, ry, rx - 1, ry + WALL, PAL.cardLine);
  line(ctx, lx, ly + WALL, bx - 1, by + WALL - 1, PAL.cardLine);
  line(ctx, bx, by + WALL - 1, rx - 1, ry + WALL, PAL.cardLine);
  line(ctx, bx, by, bx, by + WALL - 1, PAL.cardHi);
  line(ctx, lx + 1, ly + 1, bx - 1, by, PAL.cardHi);
  line(ctx, bx, by, rx - 2, ry + 1, PAL.cardHi);
  stamp(ctx, bx + 18, by + 4);
}

// Round red stamp with the spark, on the lit right face (srnk's pile boxes carry one).
function stamp(ctx, x, y) {
  const rows = ['.###.', '#.#.#', '##.##', '#.#.#', '.###.'];
  rows.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === '#') rect(ctx, x + i, y + j - Math.floor(i / 2), 1, 1, PAL.stamp);
    }),
  );
}

function drawInterior(ctx, ox, oy) {
  const o = (pts) => offsetPoly(pts, ox, oy);
  fillPolygon(ctx, o([T, R, B, L]), PAL.cardGap);
  // Visible part of the inner floor: the floor rhombus clipped by the opening.
  const ft = down(T);
  const floorLeft = intersectEdges(ft, down(L), L, B) || B;
  const floorRight = intersectEdges(ft, down(R), R, B) || B;
  fillPolygon(ctx, o([ft, floorRight, B, floorLeft]), PAL.cardShade);
  line(ctx, floorLeft[0] + ox, floorLeft[1] + oy, ft[0] + ox, ft[1] + oy, PAL.cardLine);
  line(ctx, ft[0] + ox, ft[1] + oy, floorRight[0] + ox, floorRight[1] + oy, PAL.cardLine);
  line(ctx, T[0] + ox, T[1] + oy, ft[0] + ox, ft[1] + oy, PAL.cardLine);
  line(ctx, L[0] + ox, L[1] + oy - 1, T[0] + ox - 1, T[1] + oy, PAL.cardHi);
  line(ctx, T[0] + ox, T[1] + oy, R[0] + ox - 1, R[1] + oy - 1, PAL.cardHi);
}

function intersectEdges(a, b, c, d) {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

// Tape: a cross over the top, running down the two front faces, laid in order as tapeP grows.
const TAPE_HALF = 2.5;
const TAPE_DROP = 22;
const TAPE_RUNS = Object.freeze([
  { kind: 'top', from: mid(T, R), to: mid(L, B), share: 0.34 },
  { kind: 'side', at: mid(L, B), slope: 0.5, share: 0.16 },
  { kind: 'top', from: mid(T, L), to: mid(B, R), share: 0.34 },
  { kind: 'side', at: mid(B, R), slope: -0.5, share: 0.16 },
]);

function drawTape(ctx, ox, oy, tapeP) {
  let start = 0;
  TAPE_RUNS.forEach((run) => {
    const u = clamp((tapeP - start) / run.share, 0, 1);
    start += run.share;
    if (u <= 0) return;
    if (run.kind === 'top') drawTopRun(ctx, ox, oy, run, u);
    else drawSideRun(ctx, ox, oy, run, u);
  });
}

function drawTopRun(ctx, ox, oy, run, u) {
  const end = add(run.from, scaleVec([run.to[0] - run.from[0], run.to[1] - run.from[1]], u));
  const poly = [add(run.from, [0, -TAPE_HALF]), add(end, [0, -TAPE_HALF]), add(end, [0, TAPE_HALF]), add(run.from, [0, TAPE_HALF])];
  fillPolygon(ctx, offsetPoly(poly, ox, oy), PAL.tape);
  line(ctx, run.from[0] + ox, run.from[1] + oy + TAPE_HALF, end[0] + ox, end[1] + oy + TAPE_HALF, PAL.tapeShade);
  const steps = Math.floor(9 * u);
  for (let s = 1; s <= steps; s += 3) {
    const p = add(run.from, scaleVec([run.to[0] - run.from[0], run.to[1] - run.from[1]], s / 10));
    sparkMark(ctx, Math.round(p[0] + ox), Math.round(p[1] + oy));
  }
}

function drawSideRun(ctx, ox, oy, run, u) {
  const len = TAPE_DROP * u;
  const half = [TAPE_HALF, TAPE_HALF * run.slope];
  const top0 = add(run.at, scaleVec(half, -1));
  const top1 = add(run.at, half);
  const poly = [top0, top1, add(top1, [0, len]), add(top0, [0, len])];
  fillPolygon(ctx, offsetPoly(poly, ox, oy), PAL.tape);
  line(ctx, top1[0] + ox - 1, top1[1] + oy, top1[0] + ox - 1, top1[1] + oy + len - 1, PAL.tapeShade);
}

function sparkMark(ctx, x, y) {
  rect(ctx, x, y - 1, 1, 3, PAL.stamp);
  rect(ctx, x - 1, y, 3, 1, PAL.stamp);
}

function drawClosedBox(ctx, ox, oy, tapeP) {
  drawFaces(ctx, ox, oy);
  fillPolygon(ctx, offsetPoly([T, R, B, L], ox, oy), PAL.cardLit);
  const s0 = mid(L, B);
  const s1 = mid(T, R);
  line(ctx, s0[0] + ox, s0[1] + oy, s1[0] + ox, s1[1] + oy, PAL.cardShade);
  line(ctx, L[0] + ox, L[1] + oy - 1, T[0] + ox - 1, T[1] + oy, PAL.cardLine);
  line(ctx, T[0] + ox, T[1] + oy, R[0] + ox - 1, R[1] + oy - 1, PAL.cardLine);
  line(ctx, L[0] + ox + 1, L[1] + oy + 1, B[0] + ox - 1, B[1] + oy, PAL.cardHi);
  line(ctx, B[0] + ox, B[1] + oy, R[0] + ox - 2, R[1] + oy + 1, PAL.cardHi);
  if (tapeP > 0) drawTape(ctx, ox, oy, tapeP);
}

/**
 * @returns {BoxArt}
 */
export function createPlaceholderBox() {
  const w = PAD_X * 2 + HW * 2;
  const h = PAD_TOP + HH * 2 + WALL + 1;
  const floorTop = T[1] + WALL;
  let closedCache = null;
  return Object.freeze({
    w,
    h,
    groundY: h - 2,
    frontRimY: B[1],
    lowerOutline: Object.freeze([down(L), down(B), down(R)]),
    rimTopY: T[1],
    floor: Object.freeze({ x: L[0] + 3, y: floorTop + 1.5, w: HW * 2 - 6, h: HH * 2 - 3 }),
    drawBack(ctx, x, y, closeP) {
      drawInterior(ctx, x, y);
      const a = flapAngles(closeP);
      ['tl', 'tr'].forEach((k) => {
        if (a[k] > 90) drawFlap(ctx, x, y, FLAPS[k], a[k]);
      });
    },
    drawFront(ctx, x, y, closeP) {
      drawFaces(ctx, x, y);
      const a = flapAngles(closeP);
      ['tr', 'lb', 'tl', 'br'].forEach((k) => {
        const isBack = k === 'tl' || k === 'tr';
        if (!isBack || a[k] <= 90) drawFlap(ctx, x, y, FLAPS[k], a[k]);
      });
    },
    isClosed: (closeP) => closeP >= 1,
    setShadowColor: () => {},
    drawClosed(ctx, x, y, tapeP) {
      drawClosedBox(ctx, x, y, tapeP);
    },
    closedSprite() {
      if (!closedCache) {
        const { canvas, ctx } = makeCanvas(w, h);
        drawClosedBox(ctx, 0, 0, 1);
        closedCache = canvas;
      }
      return closedCache;
    },
  });
}

export const PLACEHOLDER_CENTRE = Object.freeze(C);
