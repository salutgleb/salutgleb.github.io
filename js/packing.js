// The packing scene, the third diorama: a store room with the kit on the shelves and an open box
// in the middle. Scroll sets how many things should be in the box; the avatar runs, carries and
// tosses them in real time (packing-brain.js). With all six inside he closes the lid and lights
// the fuse, and the box goes up as the site's salute (finale.js). Reduced motion shows the
// packed, sealed box under the lit word.

import { assetUrl, loadImage, loadJSON, warn } from './assets.js';
import { createLoop } from './loop.js';
import { paintToSize, targetK } from './pixel-canvas.js';
import { makeCanvas } from './draw.js';
import { buildFinale, drawFinale } from './finale.js';
import { clamp, lerp, smoothstep } from './util.js';
import { createBrain, TIMES } from './packing-brain.js';
import { createSky } from './sky.js';
import { attachSpeech } from './speech.js';
import { currentTheme } from './theme.js';
import { SEED } from './config.js';

export const PACKING_MANIFEST = 'assets/manifest-packing.json';
// The scene plays on its own clock (Gleb 23.10: «оч долго сам сайт листается»): the stage stays
// pinned for HOLD_SVH of scroll, and once START_SHARE of it is on screen Gleb packs everything,
// lights the fuse and the salute goes, without the visitor having to scroll it along.
const HOLD_SVH = 90;
const START_SHARE = 0.7; // the scene starts when its top is this far up the viewport
const PACK_PACE = 2; // Gleb 23.10: «ускорить человечка собирающего технику в коробку в два раза»
const FUSE_MS = 1300; // the spark runs down the fuse this long, then the box goes
const PHONE_MAX_CSS = 700;
const MIN_DEVICE_PER_ART = 2;
const TOP_CSS = 150; // heading above the room
const BOTTOM_CSS = 84; // caption under the room
const MIN_ROOM_CSS = 120;
const ARC_PX = 18; // a tossed item rises this far above the straight line
const HAND_GAP = 1; // a carried item sits this far above the head
const LIGHTS_OFF = 0.6; // the room darkens this much for the salute...
const LIGHTS_MS = 450; // ...over this long
const TAG_MS = 1800;
const TAG_ICON_CSS = 40;
const WORD_SHARE = 0.62; // the word spans this share of the room
const WORD_TOP = 18; // art px below the room's top edge
const FUSE_COLOR = '#2b2725';
const SPARK = Object.freeze(['#fff3c4', '#f7c531', '#e0502a']);
const SPARK_STEP_MS = 70;
// Drafts from docs/copy-draft.md (sections 5 and 9), waiting for Gleb's OK.
const STATUS = Object.freeze({
  start: 'В эту коробку влезет всё',
  packing: 'Собираю технику',
  sealing: 'Закрываю коробку',
  lit: 'Поджигаю фитиль',
});
const SPEECH = Object.freeze([
  { speaker: 'Глеб', text: 'Шесть из шести. Пересчитаю ещё раз.', anchor: 'head', pause: 2600, draft: true },
  { speaker: 'Глеб', text: 'Отойдите на шаг, фитиль короткий.', anchor: 'head', pause: 2400, draft: true },
]);
const LINE = Object.freeze({ allPacked: 0, lit: 1 });

// ---------- loading ----------

async function loadAll(manifest) {
  const items = await Promise.all(
    manifest.items.map(async (it) => {
      const [shelf, carry, icon, iconDark] = await Promise.all([
        loadImage(assetUrl(it.shelf.file)),
        loadImage(assetUrl(it.carry.file)),
        loadImage(assetUrl(it.icon)),
        it.icon_dark ? loadImage(assetUrl(it.icon_dark)) : null,
      ]);
      return Object.freeze({ ...it, shelfImg: shelf, carryImg: carry, iconImg: icon, iconDarkImg: iconDark });
    }),
  );
  const box = manifest.box;
  // box.void: the back with a dark, starry inside (Hermione's bag): what goes in, vanishes.
  const files = [manifest.plate.file, box.front, box.void || box.back, box.lid.file, box.lid.cut, box.closed, box.gone];
  const [plate, front, back, lid, lidCut, closed, gone] = await Promise.all(files.map((f) => loadImage(assetUrl(f))));
  if (!plate || items.some((it) => !it.shelfImg || !it.carryImg)) return null;
  return Object.freeze({ manifest, items, plate, front, back, lid, lidCut, closed, gone });
}

/** @returns {Promise<object|null>} the scene's images and geometry, or null if the art is missing */
export async function loadPacking(url = PACKING_MANIFEST) {
  const manifest = await loadJSON(url);
  if (!manifest || !Array.isArray(manifest.items) || !manifest.items.length) {
    warn('manifest-packing.json not ready');
    return null;
  }
  return loadAll(manifest);
}

// ---------- geometry ----------

function brainScene(m) {
  return {
    items: m.items.map((it) => ({ stand: it.stand, face: it.face })),
    drop: m.spots.drop,
    home: m.spots.home,
    safe: m.spots.safe,
  };
}

/** Extra scroll in svh while the stage is pinned. */
export function packingRunway() {
  return Object.freeze({ total: HOLD_SVH });
}

function drawAt(ctx, img, cx, by) {
  if (!img) return;
  ctx.drawImage(img, Math.round(cx - img.naturalWidth / 2), Math.round(by - img.naturalHeight));
}

function arc(from, to, p, lift) {
  const e = smoothstep(p);
  return [lerp(from[0], to[0], e), lerp(from[1], to[1], e) - lift * 4 * p * (1 - p)];
}

// ---------- the stage ----------

/**
 * @param {{ section: HTMLElement, stage: HTMLElement, sceneEl: HTMLElement, canvas: HTMLCanvasElement,
 *           dom: { count: HTMLElement, total: HTMLElement, list: HTMLElement, tag: HTMLElement,
 *                  status: HTMLElement, replay: HTMLButtonElement },
 *           art: object, runner: object, word: object, reduced: boolean }} opts
 */
export function createPacking(opts) {
  const { section, stage, sceneEl, canvas, dom, art, runner, word } = opts;
  const m = art.manifest;
  const n = art.items.length;
  const region = m.box.region;
  const lastLid = m.box.lid.frames - 1;
  const runway = packingRunway();
  let started = false;
  const brain = createBrain(brainScene(m));
  const sky = createSky(stage);
  const out = canvas.getContext('2d');
  let reduced = Boolean(opts.reduced);
  let view = null; // { scale, artW, artH, rx, ry, cssPerArt }
  let frame = makeCanvas(1, 1);
  let plan = null;
  let replayAt = 0;
  let tagTimer = 0;
  let hushed = false;

  section.style.setProperty('--pack-runway', String(runway.total));
  dom.total.textContent = String(n);
  renderList();

  const closedCanvas = makeCanvas(region[2], region[3]);
  if (art.closed) closedCanvas.ctx.drawImage(art.closed, 0, 0);
  const finaleBox = Object.freeze({
    w: region[2],
    h: region[3],
    groundY: m.box.ground_y - region[1],
    closedSprite: () => closedCanvas.canvas,
    drawClosed: (ctx, x, y) => ctx.drawImage(closedCanvas.canvas, x, y),
  });

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, stage.clientWidth);
    const cssH = Math.max(1, stage.clientHeight);
    const phone = window.innerWidth < PHONE_MAX_CSS;
    const roomCss = Math.max(MIN_ROOM_CSS, cssH - TOP_CSS - BOTTOM_CSS);
    const fit = Math.min((cssW * dpr) / m.plate.w, (roomCss * dpr) / m.plate.h);
    // Desktop: whole device px per art px when 2 or more fit; on a 1x screen with less room,
    // a fractional scale (nearest neighbour) rather than a room at half the size.
    const whole = Math.min(targetK(dpr), Math.floor(fit));
    const scale = phone ? Math.max(MIN_DEVICE_PER_ART, fit) : whole >= 2 ? whole : Math.max(1, Math.min(targetK(dpr), fit));
    const artW = Math.ceil((cssW * dpr) / scale);
    const artH = Math.ceil((cssH * dpr) / scale);
    canvas.width = Math.round(artW * scale);
    canvas.height = Math.round(artH * scale);
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    canvas.dataset.k = scale.toFixed(2);
    const toArt = dpr / scale;
    const free = artH - (TOP_CSS + BOTTOM_CSS) * toArt;
    const rx = Math.floor((artW - m.plate.w) / 2);
    const ry = Math.floor(TOP_CSS * toArt + Math.max(0, (free - m.plate.h) / 2));
    view = Object.freeze({ scale, artW, artH, rx, ry, cssPerArt: scale / dpr });
    frame = makeCanvas(artW, artH);
    plan = buildFinale({
      box: finaleBox,
      boxX: rx + region[0],
      boxY: ry + region[1],
      artW,
      artH,
      cssPerArt: view.cssPerArt,
      word,
      wordCentreX: rx + m.plate.w / 2,
      wordTopY: ry + WORD_TOP,
      cell: clamp(Math.floor((m.plate.w * WORD_SHARE) / word.w), 2, 12),
      seed: SEED,
    });
    stage.style.setProperty('--room-bottom', `${Math.round((ry + m.plate.h) * view.cssPerArt)}px`);
  }

  // ---------- drawing ----------

  const hand = (v) => [view.rx + v.x, view.ry + v.y + runner.holdY(v.clip, v.dir, v.clipT) - HAND_GAP];
  const shelfFoot = (it) => [view.rx + it.shelf.x + it.shelf.w / 2, view.ry + it.shelf.y + it.shelf.h];
  const boxFoot = (it) => [view.rx + it.in_box[0] + it.carry.w / 2, view.ry + it.in_box[1] + it.carry.h];
  const bottomless = Boolean(m.box.void);
  // Opacity of an item p of the way into the box: whole until it reaches the rim, then gone in
  // three steps, so the pixels never blur into half-tones for long.
  const fade = (p) => (bottomless ? [1, 1, 1, 0.66, 0.33, 0][Math.min(5, Math.floor(p * 6))] : 1);
  const lidFrame = (v) => Math.round(clamp(v.lid, 0, 1) * lastLid);

  function drawStrip(ctx, img, index) {
    if (!img) return;
    const [x, y, w, h] = region;
    ctx.drawImage(img, index * w, 0, w, h, view.rx + x, view.ry + y, w, h);
  }

  // Items on their way in or out, clipped to the box so its walls hide them. The box has no
  // bottom: an item fades into the dark as it drops in and comes back out of it.
  function drawContents(ctx, v) {
    ctx.save();
    ctx.beginPath();
    m.box.inside.forEach(([x, y], i) => (i ? ctx.lineTo(view.rx + x, view.ry + y) : ctx.moveTo(view.rx + x, view.ry + y)));
    ctx.closePath();
    ctx.clip();
    art.items.forEach((it, i) => {
      const st = v.items[i];
      if (st.place === 'box') {
        if (!bottomless) drawAt(ctx, it.carryImg, ...boxFoot(it));
      } else if (st.place === 'toss') {
        ctx.globalAlpha = fade(st.p);
        drawAt(ctx, it.carryImg, ...arc(hand(v), boxFoot(it), st.p, ARC_PX));
      } else if (st.place === 'pull') {
        ctx.globalAlpha = fade(1 - st.p);
        drawAt(ctx, it.carryImg, ...arc(boxFoot(it), hand(v), st.p, ARC_PX));
      }
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  // The items between a shelf and the hands, and the one held overhead.
  function drawCarried(ctx, v) {
    art.items.forEach((it, i) => {
      const st = v.items[i];
      if (st.place === 'held') drawAt(ctx, it.carryImg, ...hand(v));
      else if (st.place === 'up') drawAt(ctx, it.carryImg, ...arc(shelfFoot(it), hand(v), st.p, ARC_PX / 2));
      else if (st.place === 'down') drawAt(ctx, it.carryImg, ...arc(hand(v), shelfFoot(it), st.p, ARC_PX / 2));
    });
  }

  // A 2 px cord out of the lid; once lit it burns down from the tip with a flickering spark.
  function drawFuse(ctx, v) {
    const pts = m.fuse.map(([x, y]) => [view.rx + x, view.ry + y]);
    const burnt = v.fuseT >= 0 ? clamp(v.fuseT / FUSE_MS, 0, 1) : 0;
    const cord = pts.slice(0, Math.max(2, Math.ceil((pts.length - 1) * (1 - burnt)) + 1));
    ctx.fillStyle = FUSE_COLOR;
    for (let i = 1; i < cord.length; i++) {
      const [px, py] = cord[i - 1];
      const [x, y] = cord[i];
      const steps = Math.max(1, Math.abs(x - px), Math.abs(y - py));
      for (let s = 0; s <= steps; s++) ctx.fillRect(Math.round(lerp(px, x, s / steps)), Math.round(lerp(py, y, s / steps)), 2, 1);
    }
    if (v.fuseT < 0) return;
    const [tx, ty] = cord[cord.length - 1];
    const flicker = Math.floor(v.fuseT / SPARK_STEP_MS);
    SPARK.forEach((color, k) => {
      const size = k === 0 ? 2 : 1;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(tx + ((flicker + k * 3) % 5) - 2), Math.round(ty - ((flicker + k) % 3) - 1), size, size);
    });
  }

  function finaleTime(v) {
    return v.fuseT >= FUSE_MS ? v.fuseT - FUSE_MS - replayAt : -1;
  }

  function drawScene(ctx, v, ft, still) {
    ctx.clearRect(0, 0, view.artW, view.artH);
    ctx.drawImage(art.plate, view.rx, view.ry);
    art.items.forEach((it, i) => {
      if (v.items[i].place === 'shelf') ctx.drawImage(it.shelfImg, view.rx + it.shelf.x, view.ry + it.shelf.y);
    });
    const exploded = ft >= 0;
    const f = lidFrame(v);
    if (exploded) drawStrip(ctx, art.gone, 0);
    else if (f > 0) drawStrip(ctx, art.lid, f);
    runner.draw(ctx, v.clip, v.dir, v.clipT, view.rx + v.x, view.ry + v.y);
    drawCarried(ctx, v);
    if (!exploded && f === 0) {
      drawStrip(ctx, art.back, 0);
      drawContents(ctx, v);
      drawStrip(ctx, art.front, 0);
    } else if (!exploded) {
      drawStrip(ctx, art.lidCut, f);
      if (f === lastLid) drawFuse(ctx, v);
    }
    if (still) {
      drawFinale(ctx, plan, plan.end, { twinkle: false });
      return;
    }
    if (!exploded) return;
    // Lights off: only on what is already drawn (the room and the runner), not on the sky.
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(8, 9, 14, ${LIGHTS_OFF * clamp(ft / LIGHTS_MS, 0, 1)})`;
    ctx.fillRect(view.rx, view.ry, m.plate.w, m.plate.h);
    ctx.restore();
    drawFinale(ctx, plan, ft);
  }

  function present() {
    out.imageSmoothingEnabled = false;
    out.clearRect(0, 0, canvas.width, canvas.height);
    out.drawImage(frame.canvas, 0, 0, canvas.width, canvas.height);
  }

  // ---------- page text ----------

  function renderList() {
    dom.list.replaceChildren(
      ...art.items.map((it) => {
        const li = document.createElement('li');
        li.textContent = it.label;
        return li;
      }),
    );
  }

  function syncInventory(v) {
    dom.count.textContent = String(v.items.filter((it) => it.place === 'box').length);
    [...dom.list.children].forEach((li, i) => li.classList.toggle('is-in', v.items[i].place === 'box'));
  }

  function showTag(index, packedCount) {
    const it = art.items[index];
    const icon = document.createElement('canvas');
    icon.className = 'pixel pack__tag-icon';
    icon.setAttribute('aria-hidden', 'true');
    const img = currentTheme() === 'dark' && it.iconDarkImg ? it.iconDarkImg : it.iconImg;
    if (img) paintToSize(icon, img, img.naturalWidth, img.naturalHeight, TAG_ICON_CSS);
    const num = document.createElement('span');
    num.className = 'pack__tag-num';
    num.textContent = `${packedCount}/${n}`;
    dom.tag.replaceChildren(icon, num, document.createTextNode(it.caption || it.label));
    dom.tag.classList.add('is-on');
    tagTimer = TAG_MS;
  }

  function handle(events, v) {
    const packedCount = v.items.filter((it) => it.place === 'box').length;
    events.forEach((e) => {
      if (e.type === 'packed') showTag(e.index, packedCount);
      if (e.type === 'packed' && packedCount === n) speech.play(LINE.allPacked, LINE.allPacked);
      if (e.type === 'lit') speech.play(LINE.lit, LINE.lit);
    });
  }

  // ---------- running ----------

  // Off until the room is well on screen, then everything at once: the brain hurries through
  // the six items, seals the box and lights the fuse. Scrolled back above the scene, it resets,
  // so the next visit plays it again.
  function clockInput() {
    const top = section.getBoundingClientRect().top;
    const vh = stage.clientHeight;
    if (top > vh) {
      if (started) {
        started = false;
        brain.reset();
        replayAt = 0;
      }
    } else if (!started && top < vh * START_SHARE) started = true;
    return started ? { target: n, seal: true } : { target: 0, seal: false };
  }

  function updatePage(v, input, ft, dt) {
    handle(brain.drain(), v);
    syncInventory(v);
    if (tagTimer > 0) {
      tagTimer -= dt;
      if (tagTimer <= 0) dom.tag.classList.remove('is-on');
    }
    if (v.fuseT < 0) {
      if (replayAt || !dom.replay.hidden) speech.stop();
      replayAt = 0;
      dom.replay.hidden = true;
    }
    const packed = v.items.every((it) => it.place === 'box');
    let status = STATUS.start;
    if (v.fuseT >= 0) status = STATUS.lit;
    else if (input.seal) status = packed ? STATUS.sealing : STATUS.packing;
    if (dom.status.textContent !== status) dom.status.textContent = status;
    if (ft > plan.end) dom.replay.hidden = false;
    // The bang ends whatever he was saying: the word is the last line.
    if (ft >= 0 && !hushed) speech.stop();
    hushed = ft >= 0;
    sky.set(v.lid > 0 ? clamp(v.lid, 0, 1) : null, ft >= 0 ? clamp(ft / plan.end, 0, 1) : 0);
    stage.classList.toggle('is-finale', ft >= 0);
  }

  function tick(dt) {
    if (!view || reduced) return;
    const input = clockInput();
    // Packing runs at PACK_PACE (the clock of runs, lifts, tosses and their frames together, so he
    // does not slide); the lid, the fuse and the salute keep their own pace.
    const packing = brain.view().items.some((it) => it.place !== 'box');
    brain.step(packing ? dt * PACK_PACE : dt, input);
    const v = brain.view();
    const ft = finaleTime(v);
    updatePage(v, input, ft, dt);
    drawScene(frame.ctx, v, ft, false);
    present();
    speech.refresh();
  }

  function drawStill() {
    brain.finish();
    const v = brain.view();
    syncInventory(v);
    dom.status.textContent = STATUS.sealing;
    sky.set(1, 1);
    drawScene(frame.ctx, v, -1, true);
    present();
  }

  const speech = attachSpeech({
    canvas,
    scene: sceneEl,
    container: stage,
    script: SPEECH,
    toCanvasCss: ([x, y]) => ({ x: x * view.cssPerArt, y: y * view.cssPerArt }),
    artPx: () => view.cssPerArt,
    manual: true,
    head: () => {
      const v = brain.view();
      return [view.rx + v.x, view.ry + v.y + runner.headY(v.clip, v.dir, v.clipT)];
    },
    reduced,
  });

  dom.replay.addEventListener('click', () => {
    const v = brain.view();
    if (v.fuseT >= FUSE_MS) replayAt = v.fuseT - FUSE_MS;
    dom.replay.hidden = true;
  });

  let pending = 0;
  new ResizeObserver(() => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      layout();
      if (reduced) drawStill();
    });
  }).observe(stage);
  layout();
  section.classList.toggle('is-static', reduced);
  if (reduced) drawStill();
  createLoop(sceneEl, tick);

  return {
    setReduced(value) {
      reduced = Boolean(value);
      section.classList.toggle('is-static', reduced);
      speech.setReduced(reduced);
      if (reduced) drawStill();
      else brain.reset();
    },
    /** For the test page: the layout and the brain's state. */
    debug: () => ({ view, state: brain.view(), runway, times: TIMES }),
  };
}
