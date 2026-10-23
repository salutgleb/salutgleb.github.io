// Sprite palette from docs/REVERSE.md A3 (measured on srnk's work), light from the upper right.
// The page itself no longer sits on crimson: page and sky colours are CSS custom properties
// per theme (css/site.css); the crimson entries stay only as sprite colours.
export const PAL = Object.freeze({
  bg: '#7c0c14', // flat crimson
  bgShadow: '#5e0a12', // cast shadow on the crimson
  bgGlow: '#a8121e', // light pool on the crimson
  red: '#d22919', // REC dot, tape logo
  redShade: '#840712',
  accent: '#e0502a', // SALUT orange, once per scene
  lamp: '#f7c531',
  white: '#f4f1ea',
  grey1: '#c3ccd0',
  grey2: '#8b8f95',
  grey3: '#56595e',
  ink: '#0d0b0b',
  cardHi: '#d8c3ad',
  cardLit: '#b69d89',
  cardShade: '#8c6d53',
  cardGap: '#5e4b3c',
  cardLine: '#2a1c16',
  skin: '#e2b081',
  skinShade: '#a8794b',
  blue: '#8fb3d9',
  blueShade: '#5d82ad',
  tape: '#c2bdbe',
  tapeShade: '#96918f',
  stamp: '#6d1313',
});

// Seven salute colours that read on the night sky: warm whites, the sprites' palette and the
// SALUT orange, each with a darker step for the spark trails. The letters С А Л Ю Т take the
// first five, the two side rockets the last two.
export const SALUTE = Object.freeze([
  Object.freeze({ main: PAL.white, trail: PAL.grey1 }),
  Object.freeze({ main: PAL.lamp, trail: PAL.accent }),
  Object.freeze({ main: PAL.blue, trail: PAL.blueShade }),
  Object.freeze({ main: PAL.cardHi, trail: PAL.cardShade }),
  Object.freeze({ main: PAL.accent, trail: PAL.redShade }),
  Object.freeze({ main: PAL.red, trail: PAL.redShade }),
  Object.freeze({ main: PAL.skin, trail: PAL.skinShade }),
]);
