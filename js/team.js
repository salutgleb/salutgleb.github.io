// «Кто снимает»: one shared room with Gleb and Sonya (assets/manifest-team-room.json when it
// exists, otherwise the static sprites/team-room/room-static.png) where they say a line each,
// then each person's achievements (badges.js). The characters from manifest-team.json appear as
// small animated avatars in the package cards.

import { paintToSize, targetK } from './pixel-canvas.js';
import { createLoop } from './loop.js';
import { loadImage, loadJSON, warn } from './assets.js';
import { makeCanvas } from './draw.js';
import { loadStudio as loadLayeredScene, drawLayers } from './studio.js';
import { createAvatar } from './avatars.js';
import { createAchievements } from './badges.js';
import { attachSpeech } from './speech.js';
import { LINES } from './speech-lines.js';
import { TEAM } from './team-data.js';

const ROOM_MANIFEST = null; // the static room (Gleb 23.10 turned the motion off; 'assets/manifest-team-room.json' brings it back)
const ROOM_STATIC = 'assets/sprites/team-room/room-static.png';
const PHONE_MAX_CSS = 700;
const MIN_DEVICE_PER_ART = 2; // phones may scale the room by a fraction, never below 2 device px
const AVATAR_CSS = 60; // avatar height next to a package

// ---------- the room ----------

// Opaque bounds of an image, so transparent margins do not count in the layout.
function opaqueBox(image) {
  const { ctx } = makeCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
  ctx.drawImage(image, 0, 0);
  const { width: w, height: h } = ctx.canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * The room as { w, h, draw(ctx, t, still) } in art px, or null. The speech anchors in
 * speech-lines.js are measured on the static room (trimmed to its opaque bounds).
 */
async function loadRoom() {
  // ROOM_MANIFEST is null until an animated room is drawn; then the static PNG steps aside.
  const manifest = ROOM_MANIFEST ? await loadJSON(ROOM_MANIFEST) : null;
  const scene = manifest ? await loadLayeredScene(manifest) : null;
  if (scene) {
    return { w: scene.w, h: scene.h, animated: true, draw: (ctx, t, still) => drawLayers(ctx, scene, 0, 0, t, still) };
  }
  const image = await loadImage(ROOM_STATIC);
  if (!image) return null;
  const box = opaqueBox(image);
  return {
    w: box.w,
    h: box.h,
    animated: false,
    draw: (ctx) => ctx.drawImage(image, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h),
  };
}

// Phones: fit the width with nearest neighbour, a fractional scale is fine (at least 2 device px
// per art px). Desktop: a whole number of device px per art px at the target density.
function createRoomCanvas(canvas, wrap, room, reducedAtStart, onLayout) {
  const art = makeCanvas(room.w, room.h);
  const out = canvas.getContext('2d');
  let still = reducedAtStart;
  let t = 0;
  let drawn = '';
  let cssPerArt = 1;

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth || window.innerWidth;
    const phone = window.innerWidth < PHONE_MAX_CSS;
    const scale = phone
      ? Math.max(MIN_DEVICE_PER_ART, (cssW * dpr) / room.w)
      : Math.max(1, Math.min(targetK(dpr), Math.floor((cssW * dpr) / room.w)));
    canvas.width = Math.round(room.w * scale);
    canvas.height = Math.round(room.h * scale);
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    canvas.dataset.k = scale.toFixed(2);
    cssPerArt = canvas.width / dpr / room.w;
    drawn = '';
    render();
    onLayout();
  }

  function render() {
    const key = room.animated && !still ? String(Math.floor(t / 50)) : 'static';
    if (key === drawn) return;
    drawn = key;
    art.ctx.clearRect(0, 0, room.w, room.h);
    room.draw(art.ctx, t, still);
    out.imageSmoothingEnabled = false;
    out.clearRect(0, 0, canvas.width, canvas.height);
    out.drawImage(art.canvas, 0, 0, canvas.width, canvas.height);
  }

  let pending = 0;
  const schedule = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      layout();
    });
  };
  new ResizeObserver(schedule).observe(wrap);
  layout();
  if (room.animated) {
    createLoop(wrap, (dt) => {
      if (!still) t += dt;
      render();
    });
  }
  return {
    setReduced(value) {
      still = value;
      drawn = '';
      render();
    },
    toCanvasCss: ([x, y]) => ({ x: x * cssPerArt, y: y * cssPerArt }),
    artPx: () => cssPerArt,
  };
}

// The room and its two lines (Gleb, then Sonya).
function createRoom(section, room, reduced) {
  const sceneWrap = section.querySelector('.team__scene');
  if (!sceneWrap) return [];
  if (!room) {
    sceneWrap.hidden = true;
    return [];
  }
  const canvas = sceneWrap.querySelector('canvas');
  let speech = null;
  const roomCanvas = createRoomCanvas(canvas, sceneWrap, room, reduced, () => speech && speech.refresh());
  speech = attachSpeech({
    canvas,
    script: LINES.team,
    toCanvasCss: roomCanvas.toCanvasCss,
    artPx: roomCanvas.artPx,
    scene: sceneWrap,
    container: section,
    reduced,
  });
  return [roomCanvas, speech];
}

// ---------- avatars in the package cards ----------

function createPackageAvatars(members, reduced, placeholders) {
  return [...document.querySelectorAll('.package__avatar[data-member]')].flatMap((canvas) => {
    const id = canvas.dataset.member;
    if (members && members[id]) {
      const observe = canvas.closest('.package') || canvas;
      return [createAvatar(canvas, members[id], { cssHeight: AVATAR_CSS, reduced, observe })];
    }
    if (placeholders) {
      const avatar = placeholders.placeholderAvatar(id);
      paintToSize(canvas, avatar.image, avatar.w, avatar.h, AVATAR_CSS);
    }
    return [];
  });
}

// ---------- section ----------

/**
 * @param {any} manifest parsed manifest-team.json or null
 * @param {Record<string, any>|null} members member scenes from avatars.js loadMembers
 * @param {boolean} reduced
 * @returns {Promise<{ setReduced: (v: boolean) => void } | null>}
 */
export async function createTeam(manifest, members, reduced) {
  const section = document.getElementById('team');
  if (!section) return null;
  const complete = Boolean(members) && TEAM.every((m) => members[m.id]);
  if (!complete) warn('manifest-team.json members not ready, drawing placeholder avatars');
  const placeholders = complete ? null : await import('./placeholder-team.js');
  const watch = section.querySelector('.team__people') || section;
  const [room, achievements] = await Promise.all([loadRoom(), createAchievements({ manifest, team: TEAM, reduced, watch })]);
  const parts = [...createRoom(section, room, reduced), achievements, ...createPackageAvatars(members, reduced, placeholders)];
  return {
    setReduced(value) {
      parts.forEach((p) => p.setReduced(value));
    },
  };
}
