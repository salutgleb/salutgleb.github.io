// Placeholder art for «Кто снимает» until manifest-team.json arrives: Gleb and Sonya, each on
// a small isometric tile of their own with an idle loop, and achievement badges (frame in two
// states plus pictograms), all drawn from palette rectangles.

import { PAL } from './palette.js';
import { makeCanvas, rect, dot, fillPolygon, line, bitmap } from './draw.js';

export const PLACEHOLDER_PERSON = Object.freeze({ w: 64, h: 68 });
export const BADGE_SIZE = 16;

const PERSON_TILE = Object.freeze({ cx: 32, top: 37, hw: 28, hh: 14, thick: 3 });

function tile(ctx, x, y, TILE) {
  const T = [x + TILE.cx, y + TILE.top];
  const L = [x + TILE.cx - TILE.hw, y + TILE.top + TILE.hh];
  const R = [x + TILE.cx + TILE.hw, y + TILE.top + TILE.hh];
  const B = [x + TILE.cx, y + TILE.top + 2 * TILE.hh];
  const d = (p) => [p[0], p[1] + TILE.thick];
  fillPolygon(ctx, [L, B, d(B), d(L)], PAL.cardShade);
  fillPolygon(ctx, [B, R, d(R), d(B)], PAL.cardLit);
  fillPolygon(ctx, [T, R, B, L], PAL.cardHi);
  line(ctx, L[0], L[1], T[0] - 1, T[1], PAL.cardLine);
  line(ctx, T[0], T[1], R[0] - 1, R[1] - 1, PAL.cardLine);
  line(ctx, L[0], L[1], L[0], L[1] + TILE.thick, PAL.cardLine);
  line(ctx, R[0] - 1, R[1], R[0] - 1, R[1] + TILE.thick, PAL.cardLine);
  line(ctx, L[0], L[1] + TILE.thick, B[0] - 1, B[1] + TILE.thick - 1, PAL.cardLine);
  line(ctx, B[0], B[1] + TILE.thick - 1, R[0] - 1, R[1] + TILE.thick, PAL.cardLine);
}

// Gleb: light brown hair, clear glasses, a light top, grey trousers, white sneakers.
function gleb(ctx, x, y, bob, blink) {
  const hair = PAL.cardShade;
  const hairLight = PAL.cardLit;
  rect(ctx, x + 4, y + bob, 9, 4, hair);
  rect(ctx, x + 5, y + bob, 6, 1, hairLight);
  rect(ctx, x + 4, y + 3 + bob, 9, 7, PAL.skin);
  rect(ctx, x + 4, y + 3 + bob, 9, 1, hair);
  rect(ctx, x + 12, y + 4 + bob, 1, 3, hair);
  // clear glasses: a thin dark frame, the skin shows through the lenses
  rect(ctx, x + 5, y + 5 + bob, 3, 1, PAL.grey3);
  rect(ctx, x + 9, y + 5 + bob, 3, 1, PAL.grey3);
  rect(ctx, x + 8, y + 6 + bob, 1, 1, PAL.grey3);
  rect(ctx, x + 5, y + 7 + bob, 3, 1, PAL.grey2);
  rect(ctx, x + 9, y + 7 + bob, 3, 1, PAL.grey2);
  if (!blink) {
    rect(ctx, x + 6, y + 6 + bob, 1, 1, PAL.ink);
    rect(ctx, x + 10, y + 6 + bob, 1, 1, PAL.ink);
  }
  rect(ctx, x + 3, y + 10 + bob, 11, 10, PAL.white);
  rect(ctx, x + 3, y + 10 + bob, 1, 10, PAL.grey1);
  rect(ctx, x + 1, y + 11 + bob, 2, 8, PAL.white);
  rect(ctx, x + 14, y + 11 + bob, 2, 8, PAL.grey1);
  rect(ctx, x + 1, y + 19 + bob, 2, 2, PAL.skin);
  rect(ctx, x + 14, y + 19 + bob, 2, 2, PAL.skin);
  rect(ctx, x + 4, y + 20, 4, 9, PAL.grey3);
  rect(ctx, x + 9, y + 20, 4, 9, PAL.grey3);
  rect(ctx, x + 3, y + 29, 5, 2, PAL.white);
  rect(ctx, x + 9, y + 29, 5, 2, PAL.white);
}

// Sonya: long wavy dark brown hair, a black top, blue jeans, an iPhone in her hand.
function sonya(ctx, x, y, bob, blink) {
  const hair = PAL.cardGap;
  const hairDark = PAL.cardLine;
  rect(ctx, x + 4, y + bob, 9, 4, hair);
  rect(ctx, x + 4, y + 3 + bob, 9, 9, hair);
  rect(ctx, x + 5, y + 3 + bob, 7, 7, PAL.skin);
  rect(ctx, x + 5, y + 3 + bob, 7, 1, hair);
  rect(ctx, x + 4, y + bob, 9, 1, hairDark);
  if (!blink) {
    rect(ctx, x + 6, y + 6 + bob, 1, 1, PAL.ink);
    rect(ctx, x + 10, y + 6 + bob, 1, 1, PAL.ink);
  }
  rect(ctx, x + 4, y + 10 + bob, 9, 9, PAL.ink);
  rect(ctx, x + 12, y + 10 + bob, 1, 9, PAL.grey3);
  rect(ctx, x + 2, y + 11 + bob, 2, 7, PAL.ink);
  rect(ctx, x + 13, y + 11 + bob, 2, 5, PAL.ink);
  rect(ctx, x + 13, y + 15 + bob, 3, 2, PAL.skin);
  rect(ctx, x + 14, y + 11 + bob, 3, 5, PAL.blueShade);
  rect(ctx, x + 15, y + 12 + bob, 1, 1, PAL.ink);
  rect(ctx, x + 2, y + 18 + bob, 2, 2, PAL.skin);
  rect(ctx, x + 4, y + 19, 4, 9, PAL.blueShade);
  rect(ctx, x + 9, y + 19, 4, 9, PAL.blueShade);
  rect(ctx, x + 4, y + 19, 9, 1, PAL.blue);
  rect(ctx, x + 3, y + 28, 5, 2, PAL.white);
  rect(ctx, x + 9, y + 28, 5, 2, PAL.white);
  // Wavy strands over the shoulders: each side steps in and out every two rows.
  for (let r = 0; r < 16; r++) {
    const wave = Math.floor(r / 2) % 2;
    const yy = y + 2 + r + bob;
    const left = x + 2 + wave;
    rect(ctx, left, yy, 2, 1, hair);
    dot(ctx, left, yy, hairDark);
    if (r < 9) {
      const right = x + 13 - wave;
      rect(ctx, right, yy, 2, 1, hair);
      dot(ctx, right + 1, yy, hairDark);
    }
  }
}

// Breathing: 1 px dip every 520 ms; a blink every ~2.9 s, offset per person.
const bobAt = (t, offset) => (Math.floor((t + offset) / 520) % 2 === 1 ? 1 : 0);
const blinkAt = (t, offset) => (t + offset) % 2900 < 120;

/**
 * Draw one person on their own tile at (x, y) for time t (ms).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {'gleb'|'sonya'} id
 * @param {number} t
 */
export function drawPlaceholderPerson(ctx, x, y, id, t) {
  tile(ctx, x, y, PERSON_TILE);
  if (id === 'sonya') sonya(ctx, x + 24, y + 22, bobAt(t, 260), blinkAt(t, 1300));
  else gleb(ctx, x + 24, y + 20, bobAt(t, 0), blinkAt(t, 0));
}

/**
 * One person alone, for the small avatar next to a package.
 * @param {'gleb'|'sonya'} id
 * @returns {{ image: HTMLCanvasElement, w: number, h: number }}
 */
export function placeholderAvatar(id) {
  const { canvas, ctx } = makeCanvas(18, 32);
  if (id === 'sonya') sonya(ctx, 0, 1, 0, false);
  else gleb(ctx, 0, 0, 0, false);
  return { image: canvas, w: 18, h: 32 };
}

const PICTOGRAMS = Object.freeze({
  camera: ['...###....', '##########', '#...##...#', '#..#..#..#', '#..#..#..#', '#...##...#', '##########'],
  mic: ['.####.', '.####.', '.####.', '.####.', '#.##.#', '.#..#.', '..##..', '..##..', '.####.'],
  play: ['#......', '###....', '#####..', '#######', '#####..', '###....', '#......'],
  star: ['....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.'],
  clapperboard: ['##..##..#', '.##..##..', '#########', '#.......#', '#.......#', '#.......#', '#########'],
  clapper: ['##..##..#', '.##..##..', '#########', '#.......#', '#.......#', '#.......#', '#########'],
  iphone: ['.####.', '#.#..#', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'],
});

const FRAME = Object.freeze([
  '....########....',
  '..##........##..',
  '.#............#.',
  '.#............#.',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '.#............#.',
  '.#............#.',
  '..##........##..',
  '....########....',
]);

/**
 * A 16×16 badge: the frame (locked or open) with a pictogram in the middle.
 * @param {string} pictogram
 * @param {boolean} open
 * @returns {HTMLCanvasElement}
 */
export function placeholderBadge(pictogram, open) {
  const { canvas, ctx } = makeCanvas(BADGE_SIZE, BADGE_SIZE);
  const fill = open ? PAL.accent : PAL.grey2;
  FRAME.forEach((row, y) => {
    const first = row.indexOf('#');
    const last = row.lastIndexOf('#');
    if (first >= 0 && last > first) rect(ctx, first, y, last - first + 1, 1, fill);
  });
  bitmap(ctx, 0, 0, FRAME, { '#': open ? PAL.ink : PAL.grey3 });
  if (open) {
    rect(ctx, 4, 2, 8, 1, PAL.lamp);
    rect(ctx, 2, 4, 1, 3, PAL.lamp);
  }
  const rows = PICTOGRAMS[pictogram] || PICTOGRAMS.star;
  const px = Math.floor((BADGE_SIZE - rows[0].length) / 2);
  const py = Math.floor((BADGE_SIZE - rows.length) / 2);
  bitmap(ctx, px, py, rows, { '#': open ? PAL.white : PAL.grey1 });
  return canvas;
}
