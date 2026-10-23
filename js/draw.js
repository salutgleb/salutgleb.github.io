// Crisp pixel drawing: whole-pixel rectangles and scanline-filled polygons, no anti-aliasing.

/**
 * @param {number} w
 * @param {number} h
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }}
 */
export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function dot(ctx, x, y, color) {
  rect(ctx, x, y, 1, 1, color);
}

/**
 * Fill a convex polygon row by row. A pixel is filled when its centre is inside.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<[number, number]>} points
 * @param {string} color
 */
export function fillPolygon(ctx, points, color) {
  const ys = points.map((p) => p[1]);
  const top = Math.floor(Math.min(...ys));
  const bottom = Math.ceil(Math.max(...ys));
  ctx.fillStyle = color;
  for (let y = top; y < bottom; y++) {
    const cy = y + 0.5;
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= cy && y1 > cy) || (y1 <= cy && y0 > cy)) {
        xs.push(x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    if (xs.length < 2) continue;
    const left = Math.round(Math.min(...xs));
    const right = Math.round(Math.max(...xs));
    if (right > left) ctx.fillRect(left, y, right - left, 1);
  }
}

/**
 * Pixel line (Bresenham), for outlines and tape edges.
 */
export function line(ctx, x0, y0, x1, y1, color) {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(ax, ay, 1, 1);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}

/**
 * Draw a list of rows like ['..##..', '.#..#.'] with a colour key, for tiny hand-made sprites.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {string[]} rows
 * @param {Record<string, string>} colors
 */
export function bitmap(ctx, x, y, rows, colors) {
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      const color = colors[ch];
      if (color) dot(ctx, x + i, y + j, color);
    });
  });
}

/**
 * Opaque pixels of a sprite as [x, y, r, g, b] tuples (alpha above half).
 * @param {CanvasImageSource} image
 * @param {number} w
 * @param {number} h
 */
export function readPixels(image, w, h) {
  const { ctx } = makeCanvas(w, h);
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 127) out.push([x, y, data[i], data[i + 1], data[i + 2]]);
    }
  }
  return out;
}
