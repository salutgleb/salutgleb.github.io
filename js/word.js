// Samples a word from the Tiny5 pixel font: rendered on an offscreen canvas at 8px, where one
// font pixel is exactly one canvas pixel, then every lit pixel becomes a target point.

import { makeCanvas } from './draw.js';

const FONT_PX = 8; // Tiny5: 1 font pixel = 1/8 em
const PAD = 2;
const BASELINE = 10;

// Used only if the font fails to load: the same letters, 5 rows tall.
const FALLBACK = Object.freeze({
  С: ['.###', '#...', '#...', '#...', '.###'],
  А: ['.##.', '#..#', '####', '#..#', '#..#'],
  Л: ['.###', '.#.#', '.#.#', '.#.#', '##.#'],
  Ю: ['#..##.', '#.#..#', '###..#', '#.#..#', '#..##.'],
  Т: ['###', '.#.', '.#.', '.#.', '.#.'],
});

/**
 * @typedef {{ w: number, h: number, letters: number, points: Array<[number, number, number]> }} WordPixels
 * points are [x, y, letterIndex] in font pixels
 */

/**
 * @param {string} text
 * @param {string} family
 * @returns {Promise<WordPixels>}
 */
export async function sampleWord(text = 'САЛЮТ', family = 'Tiny5') {
  try {
    await document.fonts.load(`${FONT_PX}px "${family}"`, text);
  } catch (error) {
    return fallbackWord(text);
  }
  if (!document.fonts.check(`${FONT_PX}px "${family}"`, text)) return fallbackWord(text);

  const width = text.length * FONT_PX + PAD * 2;
  const height = FONT_PX * 2;
  const { ctx } = makeCanvas(width, height);
  ctx.font = `${FONT_PX}px "${family}"`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, PAD, BASELINE);
  const starts = [...text].map((_, i) => PAD + ctx.measureText(text.slice(0, i)).width);
  const data = ctx.getImageData(0, 0, width, height).data;

  const raw = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 127) {
        const letter = starts.reduce((acc, sx, i) => (x + 0.5 >= sx ? i : acc), 0);
        raw.push([x, y, letter]);
      }
    }
  }
  if (raw.length < text.length * 4) return fallbackWord(text);
  return normalise(raw, text.length);
}

function fallbackWord(text) {
  let cursor = 0;
  const raw = [];
  [...text].forEach((ch, letter) => {
    const rows = FALLBACK[ch] || ['#'];
    rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && raw.push([cursor + x, y, letter])));
    cursor += rows[0].length + 1;
  });
  return normalise(raw, text.length);
}

function normalise(raw, letters) {
  const minX = Math.min(...raw.map((p) => p[0]));
  const minY = Math.min(...raw.map((p) => p[1]));
  const points = raw.map(([x, y, l]) => [x - minX, y - minY, l]);
  const w = Math.max(...points.map((p) => p[0])) + 1;
  const h = Math.max(...points.map((p) => p[1])) + 1;
  return Object.freeze({ w, h, letters, points });
}
