// Math.sin / Math.cos / Math.atan2 differ in their last bits between JS engines, and a physics
// pile amplifies that. These versions use only + − × ÷ and Math.round, which IEEE 754 makes
// identical everywhere, so the recorded fall is the same in Chrome, Safari and Firefox.

const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;
const TWO_PI = 6.283185307179586;

// Taylor series to x^17 on [−π/2, π/2]: error below 1e-12, plenty for a 60 Hz pile.
const S3 = -1 / 6;
const S5 = 1 / 120;
const S7 = -1 / 5040;
const S9 = 1 / 362880;
const S11 = -1 / 39916800;
const S13 = 1 / 6227020800;
const S15 = -1 / 1307674368000;
const S17 = 1 / 355687428096000;

export function detSin(x) {
  if (!Number.isFinite(x)) return NaN;
  let r = x - Math.round(x / TWO_PI) * TWO_PI;
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return r * (1 + r2 * (S3 + r2 * (S5 + r2 * (S7 + r2 * (S9 + r2 * (S11 + r2 * (S13 + r2 * (S15 + r2 * S17))))))));
}

export function detCos(x) {
  return detSin(x + HALF_PI);
}

// atan on [0, 1] by argument halving and a short series, then quadrant fix-up.
function atanUnit(z) {
  // atan(z) = 2·atan(z / (1 + sqrt(1 + z²))), twice, brings z below ~0.2.
  let t = z / (1 + Math.sqrt(1 + z * z));
  t = t / (1 + Math.sqrt(1 + t * t));
  const t2 = t * t;
  const series = t * (1 + t2 * (-1 / 3 + t2 * (1 / 5 + t2 * (-1 / 7 + t2 * (1 / 9 + t2 * (-1 / 11 + t2 * (1 / 13 + t2 * (-1 / 15))))))));
  return 4 * series;
}

export function detAtan2(y, x) {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const a = ay <= ax ? atanUnit(ay / ax) : HALF_PI - atanUnit(ax / ay);
  const angle = x >= 0 ? a : PI - a;
  return y >= 0 ? angle : -angle;
}

/**
 * Run fn with deterministic trig installed on Math, then restore the originals.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function withDeterministicMath(fn) {
  const original = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2 };
  Math.sin = detSin;
  Math.cos = detCos;
  Math.atan2 = detAtan2;
  try {
    return fn();
  } finally {
    Math.sin = original.sin;
    Math.cos = original.cos;
    Math.atan2 = original.atan2;
  }
}
