// Convex polygon helpers for the isometric box.

/**
 * Clip a convex polygon by another convex polygon (Sutherland–Hodgman). Points are [x, y].
 * @param {Array<[number, number]>} subject
 * @param {Array<[number, number]>} clip clockwise or counter-clockwise, convex
 * @returns {Array<[number, number]>}
 */
export function clipConvex(subject, clip) {
  const orientation = Math.sign(signedArea(clip)) || 1;
  const inside = (p, a, b) => orientation * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
  const intersect = (p, q, a, b) => {
    const a1 = q[1] - p[1];
    const b1 = p[0] - q[0];
    const c1 = a1 * p[0] + b1 * p[1];
    const a2 = b[1] - a[1];
    const b2 = a[0] - b[0];
    const c2 = a2 * a[0] + b2 * a[1];
    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-9) return q;
    return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
  };
  let output = subject;
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const pIn = inside(p, a, b);
      const qIn = inside(q, a, b);
      if (pIn && qIn) output.push(q);
      else if (pIn && !qIn) output.push(intersect(p, q, a, b));
      else if (!pIn && qIn) output.push(intersect(p, q, a, b), q);
    }
  }
  return output;
}

export function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

export const add = (p, v) => [p[0] + v[0], p[1] + v[1]];
export const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const scaleVec = (v, s) => [v[0] * s, v[1] * s];
export const offsetPoly = (points, x, y) => points.map((p) => [p[0] + x, p[1] + y]);

/**
 * Convex hull (monotone chain) of points, counter-clockwise.
 * @param {Array<[number, number]>} points
 */
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
