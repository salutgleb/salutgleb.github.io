// Showreel: the video plays on a front-facing screen on a mobile stand, drawn at the site's art
// density, and Gleb presents it: he points at the screen while his speech bubble is up.
// From 700px Gleb stands left of the screen on the same floor; on phones the stand is tall and he
// stands under the screen. The video plays muted and looped while at least half of the screen is
// on screen and pauses when it leaves or the tab is hidden. «Со звуком» toggles the sound. With
// reduced motion nothing starts by itself: the poster and a play button wait for the visitor.

import { preferredScale, targetK } from './pixel-canvas.js';
import { makeCanvas, rect } from './draw.js';
import { themeColor, onThemeChange } from './theme.js';
import { createAvatar } from './avatars.js';
import { attachSpeech } from './speech.js';
import { LINES } from './speech-lines.js';

const BEZEL = 6; // art px around the screen
const CORNER = 2; // stepped corners, art px
const SCREEN_RATIO = 9 / 16;
const PLAY_SHARE = 0.5; // share of the screen that has to be visible to play
const PHONE_MAX_CSS = 700;
const STAND_SIDE = 30; // art px from the floor to the screen when Gleb stands beside it (his waist)
const COLUMN_W = 10; // the stand, art px
const BASE_H = 5;
const BASE_SHARE = 0.34; // base width as a share of the screen width
const MIN_BASE_W = 60;
const CASTER_H = 3;
const PRESENTER_ART_H = 104; // Gleb's height in art px (with the dark-theme rim)
const BUBBLE_ROOM_CSS = 96; // phones: room between Gleb's head and the screen for his bubble

const isPhone = () => window.innerWidth < PHONE_MAX_CSS;

function standColours() {
  return {
    body: themeColor('--monitor-body', '#2b2725'),
    line: themeColor('--monitor-line', '#0d0b0b'),
    hi: themeColor('--monitor-hi', '#56595e'),
    led: themeColor('--accent', '#e0502a'),
  };
}

// The screen: a body with stepped corners, a 1 px outline and a top highlight; the picture area
// stays clear for the video element.
function drawScreen(ctx, w, screenH, c) {
  const h = 2 * BEZEL + screenH;
  const stepped = (inset, color) => {
    for (let i = 0; i < CORNER; i++) {
      const cut = CORNER - i;
      rect(ctx, inset + cut, inset + i, w - 2 * (inset + cut), 1, color);
      rect(ctx, inset + cut, h - 1 - inset - i, w - 2 * (inset + cut), 1, color);
    }
    rect(ctx, inset, inset + CORNER, w - 2 * inset, h - 2 * (inset + CORNER), color);
  };
  stepped(0, c.line);
  stepped(1, c.body);
  rect(ctx, CORNER + 1, 1, w - 2 * (CORNER + 1), 1, c.hi);
  ctx.clearRect(BEZEL, BEZEL, w - 2 * BEZEL, screenH);
  rect(ctx, BEZEL - 1, BEZEL - 1, w - 2 * BEZEL + 2, 1, c.line);
  rect(ctx, BEZEL - 1, BEZEL + screenH, w - 2 * BEZEL + 2, 1, c.line);
  rect(ctx, BEZEL - 1, BEZEL, 1, screenH, c.line);
  rect(ctx, w - BEZEL, BEZEL, 1, screenH, c.line);
  rect(ctx, w - BEZEL - 7, BEZEL + screenH + 2, 3, 2, c.led);
}

// A mobile stand under the screen, front view: a mount, a column and a wide base on casters.
function drawStand(ctx, w, top, standH, c) {
  const cx = Math.floor(w / 2);
  const floor = top + standH; // the art ends here
  const baseW = Math.max(MIN_BASE_W, Math.round(w * BASE_SHARE));
  const bx = cx - Math.floor(baseW / 2);
  const baseY = floor - CASTER_H - BASE_H;
  const colX = cx - Math.floor(COLUMN_W / 2);
  rect(ctx, colX, top, COLUMN_W, baseY - top, c.line);
  rect(ctx, colX + 1, top, COLUMN_W - 2, baseY - top, c.body);
  rect(ctx, colX + 2, top, 1, baseY - top, c.hi);
  rect(ctx, cx - 18, top, 36, 4, c.line);
  rect(ctx, cx - 17, top, 34, 3, c.body);
  rect(ctx, bx + 1, baseY, baseW - 2, BASE_H, c.line);
  rect(ctx, bx, baseY + 1, baseW, BASE_H - 2, c.line);
  rect(ctx, bx + 2, baseY + 1, baseW - 4, BASE_H - 2, c.body);
  rect(ctx, bx + 2, baseY + 1, baseW - 4, 1, c.hi);
  [bx + 5, bx + baseW - 5 - 2 * CASTER_H].forEach((x) => {
    rect(ctx, x, floor - CASTER_H, 2 * CASTER_H, CASTER_H, c.line);
    rect(ctx, x + 1, floor - CASTER_H, 2 * CASTER_H - 2, 1, c.hi);
  });
}

function createFrame(device, canvas, screen, standArt, onLayout) {
  const out = canvas.getContext('2d');
  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const k = targetK(dpr);
    const cssPerArt = k / dpr;
    const artW = Math.max(2 * BEZEL + 16, Math.floor(device.clientWidth / cssPerArt));
    const screenW = artW - 2 * BEZEL;
    const screenH = Math.round(screenW * SCREEN_RATIO);
    const boardH = 2 * BEZEL + screenH;
    const standH = standArt(cssPerArt);
    const artH = boardH + standH;
    const art = makeCanvas(artW, artH);
    const colours = standColours();
    drawStand(art.ctx, artW, boardH, standH, colours);
    drawScreen(art.ctx, artW, screenH, colours);
    canvas.width = artW * k;
    canvas.height = artH * k;
    canvas.style.width = `${artW * cssPerArt}px`;
    canvas.style.height = `${artH * cssPerArt}px`;
    out.imageSmoothingEnabled = false;
    out.clearRect(0, 0, canvas.width, canvas.height);
    out.drawImage(art.canvas, 0, 0, canvas.width, canvas.height);
    device.style.height = `${artH * cssPerArt}px`;
    Object.assign(screen.style, {
      left: `${BEZEL * cssPerArt}px`,
      top: `${BEZEL * cssPerArt}px`,
      width: `${screenW * cssPerArt}px`,
      height: `${screenH * cssPerArt}px`,
    });
    onLayout();
  }
  let pending = 0;
  const schedule = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      layout();
    });
  };
  new ResizeObserver(schedule).observe(device);
  window.addEventListener('resize', schedule); // the stand height changes at the phone breakpoint
  onThemeChange(schedule);
  layout();
}

// Gleb beside the screen: idle, pointing at the screen while his bubble is up (and, with reduced
// motion, pointing and still). Returns null when his sprite has not loaded.
function createPresenter(section, member, reduced) {
  const column = section.querySelector('.reel__presenter');
  const canvas = section.querySelector('.reel__gleb');
  if (!column || !canvas) return null;
  if (!member) {
    column.hidden = true;
    return null;
  }
  let speech = null;
  const avatar = createAvatar(canvas, member, {
    scale: preferredScale,
    reduced,
    roles: ['point'],
    stillRole: 'point',
    observe: section,
    onLayout: () => speech && speech.refresh(),
  });
  speech = attachSpeech({
    canvas,
    script: LINES.showreel,
    toCanvasCss: avatar.project,
    artPx: avatar.artPx,
    head: avatar.head,
    scene: section.querySelector('.reel__stage') || section,
    container: section,
    bounds: () => (isPhone() ? null : column),
    reduced,
    onSpeak: (_line, phase) => avatar.setRole(phase === 'typing' || phase === 'done' ? 'point' : 'idle'),
  });
  return {
    refresh: () => speech.refresh(),
    setReduced(value) {
      avatar.setReduced(value);
      speech.setReduced(value);
    },
  };
}

function wireVideo(section, device, reducedAtStart) {
  const video = section.querySelector('video');
  const play = section.querySelector('.reel__play');
  const sound = section.querySelector('.reel__sound');
  let reduced = reducedAtStart;
  let inView = false;
  let startedByVisitor = false;

  const showPlay = (show) => {
    if (play) play.hidden = !show;
  };
  const tryPlay = () => {
    const attempt = video.play();
    if (attempt && attempt.catch) {
      attempt.then(() => showPlay(false)).catch(() => showPlay(true)); // autoplay blocked: ask
    }
  };
  const sync = () => {
    const allowed = !document.hidden && inView && (!reduced || startedByVisitor);
    if (allowed && video.paused) tryPlay();
    if (!allowed && !video.paused) video.pause();
  };

  new IntersectionObserver(
    (entries) => {
      inView = entries.some((e) => e.intersectionRatio >= PLAY_SHARE);
      sync();
    },
    { threshold: [0, PLAY_SHARE, 1] },
  ).observe(section.querySelector('.reel__screen') || device);
  document.addEventListener('visibilitychange', sync);

  if (play) {
    play.addEventListener('click', () => {
      startedByVisitor = true;
      showPlay(false);
      tryPlay();
    });
  }
  video.addEventListener('click', () => {
    if (video.paused) {
      startedByVisitor = true;
      tryPlay();
    } else {
      video.pause();
      startedByVisitor = false;
      if (reduced) showPlay(true);
    }
  });
  if (sound) {
    sound.addEventListener('click', () => {
      video.muted = !video.muted;
      sound.setAttribute('aria-pressed', String(!video.muted));
      sound.textContent = video.muted ? 'Со звуком' : 'Без звука';
      if (!video.muted) {
        startedByVisitor = true;
        if (video.paused) tryPlay();
      }
    });
  }

  const setReduced = (value) => {
    reduced = value;
    video.autoplay = false;
    showPlay(reduced && !startedByVisitor);
    sync();
  };
  setReduced(reduced);
  return setReduced;
}

/**
 * @param {{ section: HTMLElement, reduced: boolean, presenter?: any }} opts presenter: Gleb's
 *   member scene from avatars.js loadMembers (the screen stands alone without it)
 * @returns {{ setReduced: (v: boolean) => void } | null}
 */
export function createShowreel(opts) {
  const { section } = opts;
  const device = section.querySelector('.reel__device');
  const screen = section.querySelector('.reel__screen');
  if (!device || !screen || !section.querySelector('video')) return null;
  const presenter = createPresenter(section, opts.presenter, opts.reduced);
  // With Gleb under the screen (phones) the stand is tall enough for him and his bubble.
  const standArt = (cssPerArt) =>
    presenter && isPhone() ? PRESENTER_ART_H + Math.ceil(BUBBLE_ROOM_CSS / cssPerArt) : STAND_SIDE;
  createFrame(device, section.querySelector('.reel__frame'), screen, standArt, () => presenter && presenter.refresh());
  const setVideoReduced = wireVideo(section, device, opts.reduced);
  return {
    setReduced(value) {
      setVideoReduced(value);
      if (presenter) presenter.setReduced(value);
    },
  };
}
