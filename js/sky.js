// The kit stage's sky: one flat colour that the scroll moves from the page colour through dusk
// to night (stops --sky-0..3 of the active theme), then deeper night (--sky-4) after the salute.
// Text on the stage turns off-white once the sky is dark.

import { themeColor, hexToRgb, mixStops, luminance, rgbCss } from './theme.js';

const NIGHT_FG = '#f3efe7';
const NIGHT_FG_DIM = '#b9b4aa';
const DARK_BELOW = 0.3; // relative luminance under which the stage text turns light

/**
 * @param {HTMLElement} stage
 */
export function createSky(stage) {
  let stops = [];
  let deep = [0, 0, 0];
  let last = '';

  function readStops() {
    stops = ['--sky-0', '--sky-1', '--sky-2', '--sky-3'].map((name) => hexToRgb(themeColor(name, '#000000')));
    deep = hexToRgb(themeColor('--sky-4', '#0b0a09'));
  }

  function clear() {
    if (last === 'page') return;
    last = 'page';
    ['--stage-bg', '--stage-fg', '--stage-fg-dim'].forEach((p) => stage.style.removeProperty(p));
    stage.classList.remove('is-night');
  }

  readStops();
  return {
    /** Re-read the stops after a theme change. */
    refresh() {
      readStops();
      last = '';
    },
    /**
     * @param {number|null} dusk 0 = day, 1 = night; null = plain page colour
     * @param {number} deepen 0..1 from night to deep night
     */
    set(dusk, deepen = 0) {
      if (dusk === null || dusk <= 0) {
        clear();
        return;
      }
      const rgb = dusk >= 1 && deepen > 0 ? mixStops([stops[3], deep], deepen) : mixStops(stops, dusk);
      const css = rgbCss(rgb);
      if (css === last) return;
      last = css;
      stage.style.setProperty('--stage-bg', css);
      const night = luminance(rgb) < DARK_BELOW;
      if (night) {
        stage.style.setProperty('--stage-fg', NIGHT_FG);
        stage.style.setProperty('--stage-fg-dim', NIGHT_FG_DIM);
      } else {
        stage.style.removeProperty('--stage-fg');
        stage.style.removeProperty('--stage-fg-dim');
      }
      stage.classList.toggle('is-night', night);
    },
  };
}
