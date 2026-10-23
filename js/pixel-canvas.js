// Every scene draws into an offscreen canvas at art size. present() copies it to the visible
// canvas at a whole number k of DEVICE pixels per art pixel (nearest neighbour), so each art
// pixel is an exact k×k square on any screen and any devicePixelRatio (REVERSE.md D3).

import { SCALE } from './config.js';
import { makeCanvas } from './draw.js';

/**
 * Preferred CSS px per art pixel for the current viewport: 3 on phones, 4 on desktop.
 * @returns {number}
 */
export function preferredScale() {
  return window.innerWidth < SCALE.phoneMaxCss ? SCALE.phone : SCALE.desktop;
}

/**
 * Device pixels per art pixel at the target density (always a whole number).
 * @param {number} dpr
 */
export function targetK(dpr) {
  return Math.max(1, Math.round(preferredScale() * dpr));
}

/**
 * Whole device pixels per art pixel for a scene that has to fit: the largest k that fits, never
 * above twice the target (so coarser art keeps its on-screen size) and never below 1.
 * With art drawn at the intended resolution the fit lands on the target itself.
 * @param {number} dpr
 * @param {number} [availDevicePx] room for the scene, in device px
 * @param {number} [sceneArtPx] scene size in art px along the same axis
 * @param {number} [boost] how far past the target coarse art may grow
 * @returns {number}
 */
export function pickK(dpr, availDevicePx = Infinity, sceneArtPx = 1, boost = SCALE.maxBoost) {
  const cap = targetK(dpr) * boost;
  const fit = Math.floor(availDevicePx / Math.max(1, sceneArtPx));
  return Math.max(1, Math.min(cap, fit));
}

/**
 * @typedef {{ artW: number, artH: number, k: number, dpr: number, cssPerArt: number }} PixelView
 */

/**
 * Wrap a visible <canvas> that fills its container.
 * @param {HTMLCanvasElement} display
 * @param {{ container?: HTMLElement,
 *           kFor?: (cssW: number, cssH: number, dpr: number) => number,
 *           onResize?: (view: Readonly<PixelView>) => void }} [options]
 */
export function createPixelCanvas(display, options = {}) {
  const container = options.container || display.parentElement;
  const kFor = options.kFor || ((_w, _h, dpr) => pickK(dpr));
  const out = display.getContext('2d', { alpha: true });
  const art = makeCanvas(1, 1);
  let view = Object.freeze({ artW: 1, artH: 1, k: 1, dpr: 1, cssPerArt: 1 });

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, container.clientWidth);
    const cssH = Math.max(1, container.clientHeight);
    const k = Math.max(1, Math.floor(kFor(cssW, cssH, dpr)));
    // Round up and let the container crop the last partial art pixel.
    const artW = Math.ceil((cssW * dpr) / k);
    const artH = Math.ceil((cssH * dpr) / k);
    art.canvas.width = artW;
    art.canvas.height = artH;
    display.width = artW * k;
    display.height = artH * k;
    display.style.width = `${(artW * k) / dpr}px`;
    display.style.height = `${(artH * k) / dpr}px`;
    art.ctx.imageSmoothingEnabled = false;
    out.imageSmoothingEnabled = false;
    view = Object.freeze({ artW, artH, k, dpr, cssPerArt: k / dpr });
    display.dataset.k = String(k); // device px per art px, handy when checking a page
    if (options.onResize) options.onResize(view);
  }

  function present() {
    out.imageSmoothingEnabled = false;
    out.clearRect(0, 0, display.width, display.height);
    out.drawImage(art.canvas, 0, 0, display.width, display.height);
  }

  let pending = 0;
  const schedule = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      resize();
    });
  };
  new ResizeObserver(schedule).observe(container);
  watchDevicePixelRatio(schedule);
  resize();

  return { ctx: art.ctx, view: () => view, present, resize };
}

// Browser zoom and moving the window to another monitor change devicePixelRatio.
function watchDevicePixelRatio(onChange) {
  const listen = () => {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener(
      'change',
      () => {
        onChange();
        listen();
      },
      { once: true },
    );
  };
  listen();
}

/**
 * Paint a still sprite at about a target size in CSS px (height by default), keeping a whole
 * number of device pixels per art pixel.
 * @param {HTMLCanvasElement} display
 * @param {CanvasImageSource} image
 * @param {number} w art width
 * @param {number} h art height
 * @param {number} targetCss
 * @param {'w'|'h'} [side]
 */
export function paintToSize(display, image, w, h, targetCss, side = 'h') {
  paintStaticSprite(display, image, w, h, targetCss / Math.max(1, side === 'w' ? w : h));
}

/**
 * Paint one still sprite into its own canvas (icons, badges, avatars).
 * @param {HTMLCanvasElement} display
 * @param {CanvasImageSource} image
 * @param {number} w art width
 * @param {number} h art height
 * @param {number} [cssScale] CSS px per art pixel; the page scale when omitted
 */
export function paintStaticSprite(display, image, w, h, cssScale) {
  const dpr = window.devicePixelRatio || 1;
  const k = cssScale ? Math.max(1, Math.round(cssScale * dpr)) : targetK(dpr);
  display.width = w * k;
  display.height = h * k;
  display.style.width = `${(w * k) / dpr}px`;
  display.style.height = `${(h * k) / dpr}px`;
  const ctx = display.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, display.width, display.height);
  ctx.drawImage(image, 0, 0, w, h, 0, 0, w * k, h * k);
}
