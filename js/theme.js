// Light and dark themes. The inline script in <head> sets data-theme before the first paint;
// this module runs the sun and moon toggle, remembers the choice when storage allows it, and
// gives the canvases their colours from the CSS custom properties of the active theme.

const STORAGE_KEY = 'salut-theme';
const THEME_COLOR = Object.freeze({ light: '#eeeae2', dark: '#151719' });
const LABEL = Object.freeze({ light: 'Включить тёмную тему', dark: 'Включить светлую тему' });
const listeners = new Set();
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function readStored() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch (error) {
    return null;
  }
}

function store(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    // Storage blocked: the choice lasts until the page is closed.
  }
}

/** @returns {'light'|'dark'} */
export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', THEME_COLOR[theme]));
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.setAttribute('aria-label', LABEL[theme]);
  listeners.forEach((fn) => fn(theme));
}

/**
 * Call fn whenever the theme changes.
 * @param {(theme: 'light'|'dark') => void} fn
 */
export function onThemeChange(fn) {
  listeners.add(fn);
}

/** Wire the toggle button and follow the system setting until the visitor picks a theme. */
export function initTheme() {
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.hidden = false;
    toggle.setAttribute('aria-label', LABEL[currentTheme()]);
    toggle.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      store(next);
      apply(next);
    });
  }
  systemDark.addEventListener('change', (event) => {
    if (!readStored()) apply(event.matches ? 'dark' : 'light');
  });
  apply(currentTheme());
}

/**
 * A colour custom property of the active theme, as written in the CSS.
 * @param {string} name e.g. '--cast-shadow'
 * @param {string} fallback
 */
export function themeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Parse #rrggbb into [r, g, b].
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance of an [r, g, b] colour. */
export function luminance([r, g, b]) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Colour at t (0..1) along evenly spaced stops, mixed in linear light.
 * @param {Array<[number, number, number]>} stops
 * @param {number} t
 * @returns {[number, number, number]}
 */
export function mixStops(stops, t) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const fromLinear = (v) => {
    const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255);
  };
  return [0, 1, 2].map((k) => fromLinear(toLinear(stops[i][k]) + (toLinear(stops[i + 1][k]) - toLinear(stops[i][k])) * f));
}

export const rgbCss = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;
