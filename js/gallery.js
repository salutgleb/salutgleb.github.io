// «Билет в галерею»: the works as a gallery wall. A ticket lies at the entrance and Gleb holds out
// his hand; a click (or 1.5 s with the section mostly on screen) sends the ticket into his hand,
// he punches it and the wall opens. Vertical scroll then pans the wall, the picture in the middle
// plays its loop, and Gleb walks along under it (the runner sprite when its art is there, else
// his avatar with a small step bob). With reduced motion the section stays a grid of posters.

import { preferredScale } from './pixel-canvas.js';
import { createLoop } from './loop.js';
import { assetUrl, loadImage, loadJSON } from './assets.js';
import { createAvatar } from './avatars.js';
import { attachSpeech } from './speech.js';
import { LINES } from './speech-lines.js';

const OPEN_SHARE = 0.15; // the wall goes live as soon as it peeks in (Gleb 23.10: «оч долго грузится при заходе»)
const OPEN_AFTER_MS = 0;
const FLY_MS = 350;
const PUNCH_MS = 300;
const FOLLOW = 0.12; // share of the gap to the target Gleb closes per frame
const BOB_MS = 150;
const SETTLE_MS = 160; // the scroll counts as resting after this long without movement
const END_SHARE = 0.97; // scroll progress that counts as the end of the wall
// The line Gleb says when the wall comes to rest on a work (speech-lines.js, LINES.gallery).
const GALLERY_LINE_FOR = Object.freeze({
  crace: 0,
  'miu-miu-new-balance': 1,
  'persona-grata': 2,
  'app-lite': 3,
  'rosatom-mediastation': 4,
  'rosatom-tvel': 5,
});
const END_LINE = 6;
const RUNNER_MANIFEST = 'assets/manifest-runner.json';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The runner (manifest-runner.json): stand facing us, and walk or run to the east (mirrored west).
async function loadRunner() {
  const m = await loadJSON(RUNNER_MANIFEST);
  const clips = m && m.clips;
  if (!clips || !Array.isArray(m.frame)) return null;
  const move = (clips.walk && clips.walk.dirs && clips.walk.dirs.e && clips.walk) || clips.run;
  const [stand, moving] = await Promise.all([
    clips.stand && clips.stand.dirs && clips.stand.dirs.s ? loadImage(assetUrl(clips.stand.dirs.s)) : null,
    move && move.dirs && typeof move.dirs.e === 'string' ? loadImage(assetUrl(move.dirs.e)) : null,
  ]);
  if (!stand || !moving) return null;
  const [fw, fh] = m.frame;
  return {
    fw,
    fh,
    scale: Number(m.scale) || 2, // art px per sprite px: he is as tall as the other avatars
    feet: m.feet || [fw / 2, fh],
    head: m.head || [fw / 2, 0],
    stand: { image: stand, ms: clips.stand.ms || 1000 },
    move: { image: moving, ms: move.ms || 60 },
  };
}

// Draws the runner into a canvas at the site's art density; returns draw(moving, dir, t).
function runnerPainter(canvas, runner) {
  const ctx = canvas.getContext('2d');
  return (moving, dir, t) => {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.round(runner.scale * preferredScale() * dpr)); // device px per sprite px
    if (canvas.width !== runner.fw * k) {
      canvas.width = runner.fw * k;
      canvas.height = runner.fh * k;
      canvas.style.width = `${(runner.fw * k) / dpr}px`;
      canvas.style.height = `${(runner.fh * k) / dpr}px`;
      // his feet on the same line as the guide's
      canvas.style.bottom = `calc(var(--feet-line) - ${((runner.fh - runner.feet[1]) * k) / dpr}px)`;
    }
    const clip = moving ? runner.move : runner.stand;
    const frames = Math.max(1, Math.floor(clip.image.naturalWidth / runner.fw));
    const f = Math.floor(t / clip.ms) % frames;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (moving && dir < 0) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(clip.image, f * runner.fw, 0, runner.fw, runner.fh, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  };
}

/**
 * @param {{ section: HTMLElement, oldList: HTMLElement|null, member: any, reduced: boolean }} opts
 *   member: Gleb's scene from avatars.js loadMembers
 * @returns {Promise<{ setReduced: (v: boolean) => void }>}
 */
export async function createGallery({ section, oldList, member, reduced }) {
  section.hidden = false;
  if (oldList) oldList.hidden = true;
  if (reduced || !member) return { setReduced() {} }; // the grid: posters, labels, video controls

  const stage = section.querySelector('.gallery__stage');
  const track = section.querySelector('.gallery__track');
  const guide = section.querySelector('.gallery__guide');
  const walkerCanvas = section.querySelector('.gallery__walker');
  const ticket = section.querySelector('.gallery__ticket');
  const puff = section.querySelector('.gallery__puff');
  const works = [...track.querySelectorAll('.work:not(.work--exit)')];
  const videos = works.map((w) => w.querySelector('video'));
  section.classList.add('is-wall');
  videos.forEach((v) => {
    v.controls = false;
    v.muted = true;
  });

  const runner = await loadRunner();
  guide.hidden = false;
  ticket.hidden = false;
  const avatar = createAvatar(guide, member, { scale: preferredScale, roles: ['point', 'talk'], observe: section });
  avatar.setRole('point'); // hand out for the ticket
  const paint = runner ? runnerPainter(walkerCanvas, runner) : null;

  let open = false;
  let admitted = false;
  let pan = 0;
  let active = -1;
  let x = null; // Gleb's left edge in stage px
  let lastP = null; // wall progress on the previous frame
  let stillMs = 0; // how long the wall has not moved
  let facing = 1; // 1 runs right, -1 runs left
  let flourish = false; // the ticket moment: Gleb stands still
  let t = 0;
  const said = new Set();
  let speaker = guide; // the canvas the bubble points at

  const speech = attachSpeech({
    canvas: () => speaker,
    script: LINES.gallery,
    toCanvasCss: (p) => (speaker === guide ? avatar.project(p) : runnerProject(p)),
    artPx: () => (speaker === guide ? avatar.artPx() : preferredScale()), // one art px either way
    head: () => (speaker === guide ? avatar.head() : runner.head),
    container: stage,
    // The labels sit just above the floor: a bubble that would cover one goes beside Gleb's head,
    // over the empty floor (Gleb 23.10: реплики не закрывают текст).
    avoid: [...track.querySelectorAll('.work__label')],
    beside: () => (speaker === guide ? guide : walkerCanvas).offsetWidth / 2,
    manual: true,
    onSpeak: (_line, phase) => {
      if (speaker === guide) avatar.setRole(phase === 'typing' ? 'talk' : open ? 'idle' : 'point');
    },
  });
  const runnerProject = ([px, py]) => {
    const s = parseFloat(walkerCanvas.style.width) / runner.fw || preferredScale();
    return { x: px * s, y: py * s };
  };
  // Lines i..last, each once; a new work cuts the line about the last one short.
  const say = (i, last = i) => {
    if (said.has(i)) return;
    for (let k = i; k <= last; k++) said.add(k);
    speech.play(i, last, true);
  };

  function layout() {
    // Side padding lets the first and the last picture reach the middle, so every work can become
    // the active one (CRACE, first on the wall, never did: Gleb 23.10 «Уралхим Crace теперь вообще
    // не открывается»).
    const half = stage.clientWidth / 2;
    track.style.paddingLeft = `${Math.max(0, half - works[0].offsetWidth / 2)}px`;
    track.style.paddingRight = `${Math.max(0, half - track.lastElementChild.offsetWidth / 2)}px`;
    pan = Math.max(0, track.scrollWidth - stage.clientWidth);
    section.style.setProperty('--pan', `${pan}px`);
  }

  // A click on a picture scrolls the wall to it, and Gleb runs over (Gleb 23.10: «хочется чтобы
  // еще по клику человечек подбегал на нужную работу»).
  function goTo(i) {
    if (!admitted) admit();
    const range = section.offsetHeight - stage.clientHeight;
    if (pan <= 0 || range <= 0) return;
    const centre = works[i].offsetLeft + works[i].offsetWidth / 2;
    const p = clamp((centre - stage.clientWidth / 2) / pan, 0, 1);
    const top = window.scrollY + section.getBoundingClientRect().top + p * range;
    window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  }

  works.forEach((w, i) => {
    const frameEl = w.querySelector('.work__frame');
    const title = w.querySelector('.work__title');
    frameEl.setAttribute('role', 'button');
    frameEl.tabIndex = 0;
    frameEl.setAttribute('aria-label', `Показать работу: ${title ? title.textContent : i + 1}`);
    frameEl.style.cursor = 'pointer';
    frameEl.addEventListener('click', () => goTo(i));
    frameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goTo(i);
      }
    });
  });

  function progress() {
    const range = section.offsetHeight - stage.clientHeight;
    return open && range > 0 ? clamp(-section.getBoundingClientRect().top / range, 0, 1) : 0;
  }

  // The work nearest the middle plays its loop; the others show their poster.
  function pick() {
    const mid = stage.clientWidth / 2;
    const centres = works.map((w) => {
      const r = w.querySelector('.work__frame').getBoundingClientRect();
      return Math.abs(r.left + r.width / 2 - mid);
    });
    const next = centres.indexOf(Math.min(...centres));
    if (next === active) return;
    active = next;
    videos.forEach((v, i) => {
      if (i === active) {
        v.preload = 'auto';
        const attempt = v.play();
        if (attempt && attempt.catch) attempt.catch(() => {});
      } else if (!v.paused) v.pause();
    });
  }

  function frame(dt) {
    t += dt;
    // A focused frame must not scroll the stage itself (browsers without overflow: clip).
    if (stage.scrollLeft) stage.scrollLeft = 0;
    const p = progress();
    track.style.setProperty('--x', `${-p * pan}px`);
    if (!open) return;
    pick();
    // The last work stands at the very end of the wall: its line, then the one about the Disk.
    if (p >= END_SHARE) {
      const lastLine = GALLERY_LINE_FOR[works[works.length - 1].dataset.slug];
      if (lastLine !== undefined && !said.has(lastLine)) say(lastLine, END_LINE);
      else say(END_LINE);
    }
    if (flourish) return; // he stands still while he takes and punches the ticket
    // While the wall slides, Gleb keeps to the middle of the screen and runs in the scroll's
    // direction, so a fast scroll can never leave him behind (Gleb 23.10: «если листать слишком
    // быстро мы обгоняем аватара и он возвращается назад»). Once the scroll rests, he steps over
    // to stand under the active picture.
    const figure = speaker === guide ? guide : walkerCanvas;
    const fr = works[active].querySelector('.work__frame').getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const v = lastP === null ? 0 : p - lastP;
    lastP = p;
    stillMs = Math.abs(v) > 1e-5 ? 0 : stillMs + dt;
    const sliding = stillMs < SETTLE_MS;
    // A line per work, once, when the scroll rests on it: a fast scroll past does not set off a
    // string of half-typed bubbles.
    if (!sliding && p < END_SHARE) {
      const line = GALLERY_LINE_FOR[works[active].dataset.slug];
      if (line !== undefined) say(line);
    }
    const edge = (px) => clamp(px, 8, sr.width - figure.offsetWidth - 8);
    const target = sliding
      ? edge(sr.width / 2 - figure.offsetWidth / 2)
      : edge(fr.left - sr.left + fr.width / 2 - figure.offsetWidth / 2);
    const from = x === null ? target : x;
    x = from + (target - from) * FOLLOW;
    const moving = sliding || Math.abs(target - x) > 1.5;
    facing = (sliding ? Math.sign(v) : Math.sign(target - from)) || facing;
    if (paint) paint(moving, facing, t);
    const bob = !paint && moving && Math.floor(t / BOB_MS) % 2 ? preferredScale() : 0;
    figure.style.transform = `translate3d(${Math.round(x)}px, ${-bob}px, 0)`;
    if (moving) speech.refresh();
  }

  async function admit() {
    if (admitted) return;
    admitted = true;
    flourish = true;
    openWall();
    const tr = ticket.getBoundingClientRect();
    const gr = guide.getBoundingClientRect();
    const hand = { x: gr.left + gr.width * 0.92, y: gr.top + gr.height * 0.44 };
    const dx = hand.x - (tr.left + tr.width / 2);
    const dy = hand.y - (tr.top + tr.height / 2);
    ticket.style.transform = `translate(${dx}px, ${dy}px) rotate(-14deg) scale(0.5)`;
    await wait(FLY_MS);
    ticket.classList.add('is-punched');
    puff.style.left = `${hand.x - stage.getBoundingClientRect().left}px`;
    puff.style.top = `${hand.y - stage.getBoundingClientRect().top}px`;
    puff.hidden = false;
    say(0);
    await wait(PUNCH_MS);
    ticket.classList.add('is-gone');
    flourish = false;
    startWalker();
  }

  function openWall() {
    open = true;
    x = entrance; // he walks from the entrance to the first picture
    section.classList.add('is-open');
    layout();
  }

  function startWalker() {
    if (runner) {
      // The ticket taken, Gleb walks on as the runner; his first line stays with him.
      walkerCanvas.hidden = false;
      paint(false, 1, 0);
      speaker = walkerCanvas;
      guide.hidden = true;
    }
    speech.refresh();
  }

  ticket.addEventListener('click', admit);
  let timer = 0;
  new IntersectionObserver(
    (entries) => {
      const ratio = entries[entries.length - 1].intersectionRatio;
      if (ratio >= OPEN_SHARE && !timer && !admitted) timer = window.setTimeout(admit, OPEN_AFTER_MS);
      else if (ratio < OPEN_SHARE && timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
    },
    { threshold: [0, OPEN_SHARE] },
  ).observe(section);
  new ResizeObserver(layout).observe(track);
  layout();
  const entrance = Math.round(Math.min(stage.clientWidth * 0.12, 160));
  guide.style.transform = `translate3d(${entrance}px, 0, 0)`;
  createLoop(section, frame);

  return { setReduced() {} };
}
