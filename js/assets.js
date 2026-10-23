// Loads the artists' manifests and sprites. Anything missing falls back to a placeholder, so
// the page always works while the art is still being drawn.

import { makeCanvas } from './draw.js';

// Placeholder art is fetched only when some real art is missing.
let placeholderItems = null;
const loadPlaceholderItems = () => {
  placeholderItems = placeholderItems || import('./placeholder-items.js');
  return placeholderItems;
};

export const ASSET_ROOT = 'assets/';

export function warn(message, detail) {
  // Missing art is expected during development; say so once, never break the page.
  console.warn(`[salut] ${message}`, detail === undefined ? '' : detail);
}

/**
 * @param {string} url
 * @returns {Promise<any|null>}
 */
export async function loadJSON(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    warn(`could not read ${url}`, error);
    return null;
  }
}

const IMAGE_RETRIES = 2;
const RETRY_DELAY_MS = 250;

function loadImageOnce(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Load an image, retrying a dropped request twice before giving up.
 * @param {string} url
 * @returns {Promise<HTMLImageElement|null>}
 */
export async function loadImage(url) {
  for (let attempt = 0; attempt <= IMAGE_RETRIES; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    const img = await loadImageOnce(attempt ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}` : url);
    if (img) return img;
  }
  warn(`missing sprite ${url}`);
  return null;
}

export const assetUrl = (file) => (/^(https?:)?\//.test(file) ? file : ASSET_ROOT + file.replace(/^assets\//, ''));

/**
 * RGBA pixels of an image at its native size.
 * @param {CanvasImageSource} image
 * @param {number} w
 * @param {number} h
 * @returns {Uint8ClampedArray}
 */
export function pixelsOf(image, w, h) {
  const { ctx } = makeCanvas(w, h);
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

/**
 * The sprite to draw for an item in the current theme.
 * @param {{ image: CanvasImageSource, imageDark: CanvasImageSource|null }} item
 * @param {boolean} dark
 */
export const spriteOf = (item, dark) => (dark && item.imageDark ? item.imageDark : item.image);

const num = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : fallback);

// A manifest hull is used only if it is a real polygon inside the sprite.
function readHull(hull, w, h) {
  if (!Array.isArray(hull) || hull.length < 3) return null;
  const points = hull.map((p) => [Number(p[0]), Number(p[1])]);
  const ok = points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= w && y <= h);
  return ok ? Object.freeze(points) : null;
}

/**
 * Items in drop order: [{ id, label, w, h, image, imageDark, hull, placeholder }].
 * imageDark is the artist's dark-theme variant (same size and hull), or null.
 * @param {any} manifest parsed manifest-items.json or null
 */
export async function loadItems(manifest) {
  const list = Array.isArray(manifest) ? manifest : manifest && Array.isArray(manifest.items) ? manifest.items : null;
  const source = list && list.length ? list : (await loadPlaceholderItems()).DEFAULT_ITEMS;
  const entries = source.filter((e) => e && (e.id || e.file));
  return Promise.all(
    entries.map(async (entry, index) => {
      const id = String(entry.id || `item-${index}`);
      const label = String(entry.label || entry.name || id);
      const [image, imageDark] = await Promise.all([
        entry.file ? loadImage(assetUrl(entry.file)) : null,
        entry.fileDark ? loadImage(assetUrl(entry.fileDark)) : null,
      ]);
      if (image) {
        const w = num(entry.w, image.naturalWidth);
        const h = num(entry.h, image.naturalHeight);
        return Object.freeze({ id, label, w, h, image, imageDark, hull: readHull(entry.hull, w, h), placeholder: false });
      }
      const { placeholderItem } = await loadPlaceholderItems();
      const ph = placeholderItem(id, num(entry.w, 0), num(entry.h, 0));
      return Object.freeze({ id, label, w: ph.w, h: ph.h, image: ph.image, imageDark: null, hull: null, placeholder: true });
    }),
  );
}
