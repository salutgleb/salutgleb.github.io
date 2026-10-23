// The sticky kit section: scroll picks the recorded drop frame, then the lid closes and the
// tape is laid, and when the visitor reaches the sealed box the finale plays in real time.

import { RUNWAY, EASE_FOLLOW, SEED } from './config.js';
import { createPixelCanvas, pickK } from './pixel-canvas.js';
import { createLoop } from './loop.js';
import { buildFinale, drawFinale, wordCell } from './finale.js';
import { createItemLayer, drawKitFrame, stageLayout } from './kit-draw.js';
import { clamp } from './util.js';
import { createSky } from './sky.js';

// The open box takes at most these shares of the stage: wide enough that the 328 px box keeps
// 1 CSS px per art px on a 360-390 px phone, tall enough for 2 on a 1440 x 900 desktop.
const BOX_WIDTH_SHARE = 0.92;
const BOX_HEIGHT_SHARE = 0.64;
const SNAP_UNITS = 80; // jumps larger than this (reload far down, End key) skip the easing
const IDLE_REDRAW_MS = 100; // once the word stands, only the twinkles change
const TWINKLE_MS = 140; // the void's stars change this often
const STATUS = Object.freeze({
  start: 'Листайте: в эту коробку влезет всё',
  packing: 'Закрываю коробку',
  sealed: 'Собрано. Сейчас тряхнёт',
});
const REPLAY_TEXT = 'Ещё салют';

/**
 * Scroll lengths in svh for n items.
 * @param {number} n
 */
export function computeRunway(n) {
  const drop = Math.max(RUNWAY.minDrop, n * RUNWAY.perItem);
  const total = drop + RUNWAY.lid + RUNWAY.hold + RUNWAY.finale;
  return Object.freeze({ drop, lid: RUNWAY.lid, hold: RUNWAY.hold, finale: RUNWAY.finale, total });
}

function approach(current, target, share, epsilon) {
  const next = current + (target - current) * share;
  return Math.abs(target - next) < epsilon ? target : next;
}

function wordPlacement(view, layout, box, word) {
  const cell = wordCell(view.artW, view.cssPerArt, word);
  const height = word.h * cell;
  const centreY = layout.boxY + box.h * 0.42;
  return { wordCentreX: layout.boxX + box.w / 2, wordTopY: Math.round(centreY - height / 2), cell };
}

/**
 * @param {{ section: HTMLElement, stage: HTMLElement, canvas: HTMLCanvasElement,
 *           still: HTMLElement, stillCanvas: HTMLCanvasElement,
 *           dom: { count: HTMLElement, total: HTMLElement, list: HTMLElement, tag: HTMLElement,
 *                  status: HTMLElement, replay: HTMLButtonElement },
 *           scene: { box: any, items: any[], rec: any, order: number[] },
 *           word: import('./word.js').WordPixels, reduced: boolean }} opts
 */
export function createKitStage(opts) {
  const { section, stage, canvas, dom, word } = opts;
  const scene = Object.freeze({ ...opts.scene });
  let reduced = opts.reduced;
  const runway = computeRunway(scene.items.length);
  section.style.setProperty('--kit-runway', String(runway.total));
  renderList(dom, scene.items);
  dom.replay.textContent = REPLAY_TEXT;
  const captionOf = (item) => (scene.box.captions && scene.box.captions.get(item.id)) || item.label;

  const state = { u: 0, frame: 0, lid: 0, t: 0, clock: 0, playing: false, drawn: '', ui: '' };
  const sky = createSky(stage);
  let layout = null;
  let plan = null;
  let itemLayer = null;
  let ready = false;

  const pc = createPixelCanvas(canvas, {
    container: opts.sceneEl || stage,
    kFor: (cssW, cssH, dpr) =>
      Math.min(pickK(dpr, cssW * dpr * BOX_WIDTH_SHARE, scene.box.w), pickK(dpr, cssH * dpr * BOX_HEIGHT_SHARE, scene.box.h)),
    onResize: (view) => {
      layout = stageLayout(view, scene.box);
      itemLayer = createItemLayer(view.artW, view.artH, scene.box, layout);
      const placement = wordPlacement(view, layout, scene.box, word);
      plan = buildFinale({
        box: scene.box,
        ...layout,
        artW: view.artW,
        artH: view.artH,
        cssPerArt: view.cssPerArt,
        word,
        seed: SEED,
        ...placement,
      });
      positionOverlays(view);
      state.drawn = '';
      if (ready) render();
    },
  });

  const still = createStill(opts, word);

  function positionOverlays(view) {
    const px = (art) => `${Math.round(art * view.cssPerArt)}px`;
    stage.style.setProperty('--box-top', px(layout.boxY));
    stage.style.setProperty('--box-bottom', px(layout.boxY + scene.box.h));
    stage.style.setProperty('--word-bottom', px(plan.wordY + plan.word.h * plan.cell + 6));
  }

  function scrolledUnits() {
    const unitPx = stage.clientHeight / 100;
    return clamp(-section.getBoundingClientRect().top / Math.max(1, unitPx), 0, runway.total);
  }

  // One eased scroll position drives the drop frame, the lid, the tape and the sky together.
  function update(dt) {
    state.clock += dt;
    if (reduced) {
      state.frame = scene.rec.frameCount - 1;
      state.lid = scene.rec.swallow ? 1 : 0; // bottomless: the finished state is the sealed box
      sky.set(null);
      return;
    }
    const share = 1 - Math.pow(1 - EASE_FOLLOW, dt / (1000 / 60));
    const target = scrolledUnits();
    state.u = Math.abs(target - state.u) > SNAP_UNITS ? target : approach(state.u, target, share, 0.02);
    const u = state.u;
    const sealedAt = runway.drop + runway.lid + runway.hold;
    state.frame = clamp(u / runway.drop, 0, 1) * (scene.rec.frameCount - 1);
    state.lid = clamp((u - runway.drop) / runway.lid, 0, 1);
    sky.set(clamp((u - runway.drop) / (runway.lid + runway.hold), 0, 1), clamp((u - sealedAt) / runway.finale, 0, 1));
    const reached = u >= sealedAt;
    const backInside = u < runway.drop + runway.lid * 0.98;
    if (backInside && (state.playing || state.t > 0)) {
      state.playing = false;
      state.t = 0;
    }
    if (reached && !state.playing && state.t === 0 && state.lid >= 1) state.playing = true;
    if (state.playing) state.t += dt;
  }

  // The void's stars twinkle a few times a second while the box is open.
  const twinkleTick = () => (scene.rec.swallow && !reduced && state.lid < 1 ? Math.floor(state.clock / TWINKLE_MS) : 0);

  function render() {
    const view = pc.view();
    const finale = state.playing || state.t > 0;
    const settled = finale && state.t > plan.end;
    const key = settled
      ? `e${Math.floor(state.t / IDLE_REDRAW_MS)}:${view.artW}x${view.artH}`
      : finale
        ? `f${Math.floor(state.t / 16)}:${view.artW}x${view.artH}`
        : `k${state.frame.toFixed(2)}:${state.lid.toFixed(3)}:${twinkleTick()}:${view.artW}x${view.artH}`;
    if (key === state.drawn) return;
    state.drawn = key;
    pc.ctx.clearRect(0, 0, view.artW, view.artH);
    if (finale) drawFinale(pc.ctx, plan, state.t, { twinkle: !reduced });
    else drawKitFrame(pc.ctx, scene, layout, itemLayer, state.frame, state.lid, reduced ? 0 : state.clock);
    pc.present();
    syncUi();
  }

  function syncUi() {
    const landed = [...scene.rec.landFrame].map((lf) => state.frame >= lf);
    const count = landed.filter(Boolean).length;
    // The caption names the item in the air (from early in its fall) and stays until the next.
    const shown = scene.rec.showFrame || scene.rec.landFrame;
    const latest = shown.reduce(
      (best, sf, i) => (state.frame >= sf && (best < 0 || sf >= shown[best]) ? i : best),
      -1,
    );
    const finale = state.playing || state.t > 0;
    const done = finale && state.t >= plan.wordEnd;
    let status = '';
    if (!finale && count === 0) status = STATUS.start;
    else if (!finale && state.lid > 0 && state.lid < 1) status = STATUS.packing;
    else if (!finale && state.lid >= 1) status = STATUS.sealed;
    const key = `${landed.join('')}|${latest}|${status}|${finale}|${done}`;
    if (key === state.ui) return;
    state.ui = key;
    dom.count.textContent = String(count);
    [...dom.list.children].forEach((li, i) => li.classList.toggle('is-in', landed[i]));
    // The caption goes once the lid starts closing: the status line takes over.
    const tagged = finale || reduced || latest < 0 || state.lid > 0 ? null : latest;
    setTag(dom.tag, tagged, scene.items, captionOf);
    dom.status.textContent = reduced ? '' : status;
    stage.classList.toggle('is-finale', finale);
    if (done) dom.replay.hidden = false;
    if (!finale) dom.replay.hidden = true;
  }

  dom.replay.addEventListener('click', () => {
    state.t = 0;
    state.playing = true;
    state.drawn = '';
    loop.refresh();
  });

  const loop = createLoop(section, (dt) => {
    update(dt);
    render();
  });

  function setReduced(value) {
    reduced = value;
    section.classList.toggle('is-static', reduced);
    opts.still.hidden = !reduced;
    state.drawn = '';
    state.ui = '';
    if (reduced) {
      state.playing = false;
      state.t = 0;
      update(0);
      still.render();
    }
    render();
  }

  function refreshTheme() {
    sky.refresh();
    state.drawn = '';
    if (reduced) still.render();
    render();
  }

  ready = true;
  setReduced(reduced);
  return { setReduced, refreshTheme };
}

function renderList(dom, items) {
  dom.total.textContent = String(items.length);
  dom.list.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement('li');
      li.textContent = item.label;
      return li;
    }),
  );
}

function setTag(tag, index, items, captionOf) {
  if (index === null) {
    tag.replaceChildren();
    tag.classList.remove('is-on');
    return;
  }
  const num = document.createElement('span');
  num.className = 'kit__tag-num';
  num.textContent = String(index + 1).padStart(2, '0');
  tag.replaceChildren(num, document.createTextNode(` ${captionOf(items[index])}`));
  tag.classList.add('is-on');
}

// Reduced motion: the finished states as a still, the sealed box under the lit word.
function createStill(opts, word) {
  const { scene } = opts;
  let view = null;
  let pc = null;
  pc = createPixelCanvas(opts.stillCanvas, {
    container: opts.still,
    kFor: (cssW, cssH, dpr) =>
      Math.min(pickK(dpr, cssW * dpr * BOX_WIDTH_SHARE, scene.box.w), pickK(dpr, cssH * dpr * BOX_HEIGHT_SHARE, scene.box.h)),
    onResize: (v) => {
      view = v;
      if (!opts.still.hidden) render();
    },
  });
  function render() {
    if (!pc || !view || view.artH < 4) return;
    const layout = { boxX: Math.round(view.artW / 2 - scene.box.w / 2), boxY: view.artH - scene.box.h - 4 };
    const cell = wordCell(view.artW, view.cssPerArt, word);
    const plan = buildFinale({
      box: scene.box,
      ...layout,
      artW: view.artW,
      artH: view.artH,
      cssPerArt: view.cssPerArt,
      word,
      seed: SEED,
      cell,
      wordCentreX: layout.boxX + scene.box.w / 2,
      wordTopY: Math.max(4, layout.boxY - word.h * cell - Math.round(18 / view.cssPerArt)),
    });
    pc.ctx.clearRect(0, 0, view.artW, view.artH);
    drawFinale(pc.ctx, plan, plan.end + 1, { twinkle: false });
    scene.box.drawClosed(pc.ctx, layout.boxX, layout.boxY, 1);
    pc.present();
  }
  return { render };
}
