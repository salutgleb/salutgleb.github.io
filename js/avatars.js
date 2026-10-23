// Gleb and Sonya as small animated characters (manifest-team.json `members`): the package cards,
// the showreel presenter and the contact block. Each member has one loop per role, all standing
// in for the same still: idle (the default), talk while a speech bubble types, point beside the
// showreel screen, wave. Only one plays at a time. An avatar knows where its head is, so a speech
// bubble can point at it.

import { paintStaticSprite } from './pixel-canvas.js';
import { createLoop } from './loop.js';
import { makeCanvas } from './draw.js';
import { loadStudio as loadLayeredScene, drawLayers, frameOf, playingLoops } from './studio.js';
import { currentTheme, onThemeChange } from './theme.js';

const HALO_DARK = '#4a4e55'; // graphite rim so the black outline reads on the dark theme
const HALO_OFFSETS = Object.freeze([[0, 1], [2, 1], [1, 0], [1, 2], [0, 0], [2, 0], [0, 2], [2, 2]]);
const HEAD_ROWS = 10; // rows under the top of the hair that give the head's centre

const isTile = (l) => /tile|floor/i.test(l.id);

/**
 * Member scenes from manifest-team.json: { id: scene } with every member that loaded, or null.
 * @param {any} manifest
 * @returns {Promise<Record<string, any>|null>}
 */
export async function loadMembers(manifest) {
  const members = manifest && (manifest.members || manifest.characters || manifest.people);
  if (!members) return null;
  const entries = Array.isArray(members) ? members.map((m) => [String(m.id), m]) : Object.entries(members);
  const scenes = await Promise.all(entries.map(async ([id, raw]) => [id, await loadLayeredScene(raw)]));
  const ok = Object.fromEntries(scenes.filter(([, s]) => s));
  return Object.keys(ok).length ? ok : null;
}

function boundsOf(layers) {
  const xs = layers.flatMap((l) => [l.x, l.x + l.frameW]);
  const ys = layers.flatMap((l) => [l.y, l.y + l.frameH]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Top of the hair and the centre of the head, in avatar coordinates (from the still).
function findHead(layer, box) {
  const { ctx } = makeCanvas(layer.frameW, layer.frameH);
  ctx.drawImage(layer.image, 0, 0, layer.frameW, layer.frameH, 0, 0, layer.frameW, layer.frameH);
  const { data } = ctx.getImageData(0, 0, layer.frameW, layer.frameH);
  const opaqueXs = (y) => [...Array(layer.frameW).keys()].filter((x) => data[(y * layer.frameW + x) * 4 + 3] > 0);
  const rows = [...Array(layer.frameH).keys()];
  const top = rows.find((y) => opaqueXs(y).length > 0);
  if (top === undefined) return [box.w / 2, 0];
  const xs = rows.slice(top, top + HEAD_ROWS).flatMap(opaqueXs);
  const centre = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
  return [layer.x - box.x + centre, layer.y - box.y + top];
}

// A 1 px rim around the silhouette, drawn into reusable buffers.
function drawHalo(source, buffers, w, h) {
  const { tint, out } = buffers;
  tint.ctx.globalCompositeOperation = 'source-over';
  tint.ctx.clearRect(0, 0, w + 2, h + 2);
  HALO_OFFSETS.forEach(([dx, dy]) => tint.ctx.drawImage(source, dx, dy));
  tint.ctx.globalCompositeOperation = 'source-in';
  tint.ctx.fillStyle = HALO_DARK;
  tint.ctx.fillRect(0, 0, w + 2, h + 2);
  tint.ctx.globalCompositeOperation = 'source-over';
  out.ctx.clearRect(0, 0, w + 2, h + 2);
  out.ctx.drawImage(tint.canvas, 0, 0);
  out.ctx.drawImage(source, 1, 1);
  return out.canvas;
}

/**
 * @typedef {{ setReduced: (v: boolean) => void, setRole: (role: string) => void,
 *             head: () => [number, number], artPx: () => number,
 *             project: (p: [number, number]) => { x: number, y: number } }} Avatar
 */

/**
 * Draw a member (without their floor tile) into a canvas, animated while it is on screen.
 * @param {HTMLCanvasElement} canvas
 * @param {{ layers: any[], replacedIds: string[] }} scene member scene from loadMembers
 * @param {{ scale?: () => number, cssHeight?: number, reduced?: boolean, observe?: Element,
 *           roles?: string[], stillRole?: string, onLayout?: () => void }} opts
 *   scale: CSS px per art px (or cssHeight: about this tall); roles: the loops this avatar uses
 *   besides idle (they set its frame); stillRole: with reduced motion show the first frame of
 *   this role instead of the still (the presenter keeps pointing); onLayout: size or offset changed.
 * @returns {Avatar}
 */
export function createAvatar(canvas, scene, opts = {}) {
  const roles = ['idle', ...(opts.roles || [])];
  const layers = scene.layers.filter((l) => !isTile(l) && (!l.replaces || !l.role || l.isDefault || roles.includes(l.role)));
  const own = { ...scene, layers };
  const box = boundsOf(layers);
  const head = findHead(layers.find((l) => !l.replaces) || layers[0], box);
  const art = makeCanvas(box.w, box.h);
  const halo = { tint: makeCanvas(box.w + 2, box.h + 2), out: makeCanvas(box.w + 2, box.h + 2) };
  const scale = opts.scale || (() => (opts.cssHeight || box.h) / box.h);
  let reduced = Boolean(opts.reduced);
  let role = 'idle';
  let roleSince = 0;
  let t = 0;
  let drawn = '';
  let geometry = { cssPerArt: 1, offset: 0, key: '' };

  // Idle runs on the avatar's own clock; another role starts from its first frame.
  const pose = () => {
    if (!reduced) return { still: false, time: role === 'idle' ? t : t - roleSince, role };
    return opts.stillRole ? { still: false, time: 0, role: opts.stillRole } : { still: true, time: 0, role };
  };
  const frameKey = (p) => (p.still ? 'still' : playingLoops(own, p.role).map((l) => `${l.id}:${frameOf(l, p.time)}`).join('|'));

  function render(force) {
    const p = pose();
    const dark = currentTheme() === 'dark';
    const s = scale();
    const dpr = window.devicePixelRatio || 1;
    const key = `${frameKey(p)}:${dark}:${s}:${dpr}`;
    if (!force && key === drawn) return;
    drawn = key;
    art.ctx.clearRect(0, 0, box.w, box.h);
    drawLayers(art.ctx, own, -box.x, -box.y, p.time, p.still, p.role);
    const pad = dark ? 2 : 0;
    paintStaticSprite(canvas, dark ? drawHalo(art.canvas, halo, box.w, box.h) : art.canvas, box.w + pad, box.h + pad, s);
    const cssPerArt = Math.max(1, Math.round(s * dpr)) / dpr;
    const geometryKey = `${cssPerArt}:${pad}`;
    if (geometryKey !== geometry.key) {
      geometry = { cssPerArt, offset: pad / 2, key: geometryKey };
      if (opts.onLayout) opts.onLayout();
    }
  }

  render(true);
  createLoop(opts.observe || canvas, (dt) => {
    if (!reduced) t += dt;
    render(false);
  });
  onThemeChange(() => render(true));
  window.addEventListener('resize', () => render(false));

  return {
    setReduced(value) {
      reduced = value;
      render(true);
    },
    setRole(next) {
      if (next === role) return;
      role = next;
      roleSince = t;
      render(false);
    },
    head: () => head,
    artPx: () => geometry.cssPerArt,
    project: ([x, y]) => ({ x: (x + geometry.offset) * geometry.cssPerArt, y: (y + geometry.offset) * geometry.cssPerArt }),
  };
}
