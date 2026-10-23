// Pixel speech bubbles, like the dialogue in srnk's and Yandex's pixel videos: a light box with a
// 2 art-px dark border and stepped corners, a stepped tail pointing at the speaker's head, the
// line typed letter by letter (real HTML text) and a blinking ▼ once it is complete.
//
// attachSpeech() plays a scene's script once the scene is at least half on screen. It plays
// again only after the scene has left the screen completely and some time has passed, so small
// scrolls never restart it. Typing and pauses run on animation frames, so they stop in hidden
// tabs. Every line is also in a visually hidden transcript; with reduced motion a line appears
// whole and stays up as long as typing plus the pause would take.
//
// A scene supplies the projection from its own art px to CSS px of its canvas:
//   const speech = attachSpeech({ canvas, script, toCanvasCss: ([x, y]) => ({ x: x * s, y: y * s }),
//                                 artPx: () => s, scene: sectionOrStage });
//   speech.refresh(); // after the scene moved or rescaled
//   speech.setReduced(true);
// With manual: true nothing watches the scene; call speech.play() and speech.stop() yourself
// (the kit's sticky stage speaks at scroll moments, not on visibility).

import { tieShortWords } from './typo.js';

const CHARS_PER_SECOND = 35;
const DEFAULT_PAUSE_MS = 2600;
const START_DELAY_MS = 450; // a beat after the scene comes into view
const REPLAY_AFTER_MS = 20000; // a scene that left the screen speaks again only after this
const PLAY_SHARE = 0.5;
const GAP_CSS = 4; // between the tail tip and the head
const EDGE_CSS = 8; // bubbles stay this far inside the viewport, the container and any fence
const TAIL_UNITS = Object.freeze({ w: 10, h: 6 }); // tail size in bubble pixels (--p)
const MAX_DT_MS = 100;
const MAX_WAIT_MS = 6000; // a line waits for the speaker's gesture at most this much longer

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAIL_LINE = 'M0 0h2v2H0zM8 0h2v2H8zM1 2h2v1H1zM7 2h2v1H7zM2 3h2v1H2zM6 3h2v1H6zM3 4h4v1H3zM4 5h2v1H4z';
const TAIL_FILL = 'M2 0h6v2H2zM3 2h4v1H3zM4 3h2v1H4z';
const MORE = 'M0 0h5v1H0zM1 1h3v1H1zM2 2h1v1H2z';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const cpsOf = (line) => line.cps || CHARS_PER_SECOND; // a line may type slower (a whisper)
const typingMs = (line) => (line.text.length / cpsOf(line)) * 1000;

// One art px of the scene in CSS px, rounded to whole device px so the border stays crisp.
const snapToDevice = (css) => {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(1, Math.round(css * dpr)) / dpr;
};

function svg(viewBox, parts, className) {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('class', className);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('shape-rendering', 'crispEdges');
  parts.forEach(([d, cls]) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', cls);
    el.append(path);
  });
  return el;
}

// The whole line is always laid out: the typed part is visible, the rest is invisible, so the
// box keeps its size and no word jumps to another line while it types.
function createBubble() {
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.hidden = true;
  const text = document.createElement('p');
  text.className = 'bubble__text';
  const shown = document.createElement('span');
  const rest = document.createElement('span');
  rest.className = 'bubble__rest';
  text.append(shown, rest);
  bubble.append(
    text,
    svg('0 0 5 3', [[MORE, 'bubble__ink']], 'bubble__more'),
    svg(`0 0 ${TAIL_UNITS.w} ${TAIL_UNITS.h}`, [[TAIL_FILL, 'bubble__paper'], [TAIL_LINE, 'bubble__ink']], 'bubble__tail'),
  );
  return { bubble, text, shown, rest };
}

function createTranscript(script) {
  const transcript = document.createElement('div');
  transcript.className = 'visually-hidden';
  transcript.append(
    ...script.map((line) => {
      const p = document.createElement('p');
      p.textContent = `${line.speaker}: ${line.text}`;
      return p;
    }),
  );
  return transcript;
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// Width of the longest laid-out line of an element's text, in layout px: client rects include
// transforms (the bubble pops in from a smaller scale), so divide the box's current scale out.
function textWidth(el, box) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0);
  if (!rects.length) return 0;
  const scale = box.offsetWidth ? box.getBoundingClientRect().width / box.offsetWidth : 1;
  return (Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left))) / (scale || 1);
}

/**
 * @typedef {{ speaker: string, text: string, anchor: [number, number] | 'head', pause?: number,
 *             cps?: number, roles?: { typing?: string|string[], done?: string|string[] },
 *             draft?: boolean }} SpeechLine roles: what the speaker acts while the line types
 *   and once it is done (read by the scene in onSpeak)
 * @typedef {'typing'|'done'|'hidden'|'stopped'} SpeechPhase hidden: the line ended (the next
 *   one, if any, follows at once); stopped: the scene left the screen mid-script
 */

/**
 * Attach a script of speech bubbles to a scene canvas.
 * @param {{ canvas: HTMLElement, script: ReadonlyArray<SpeechLine>,
 *           toCanvasCss: (point: [number, number]) => { x: number, y: number },
 *           artPx?: () => number, head?: () => [number, number], scene?: Element,
 *           container?: HTMLElement, bounds?: () => (Element|null), avoid?: Element[],
 *           beside?: () => number,
 *           reduced?: boolean, manual?: boolean, busy?: () => boolean,
 *           onSpeak?: (line: SpeechLine, phase: SpeechPhase) => void }} opts
 *   canvas: the scene canvas; toCanvasCss: art px of the scene to CSS px from the canvas's top
 *   left corner; artPx: CSS px per art px (sets the bubble's pixel size); head: the anchor for
 *   lines with anchor 'head'; scene: the element whose visibility starts the script (the canvas
 *   by default); container: a positioned ancestor that holds the bubble (the section by default);
 *   bounds: an element the bubble must stay inside horizontally; avoid: elements the bubble must
 *   not cover (it then goes under the anchor); beside: when it goes under, it also steps this many
 *   CSS px to the side of the anchor (the speaker's half width), so it covers neither the text
 *   above nor the speaker below; manual: play and stop only on request;
 *   busy: true while the speaker's gesture still plays, so the finished line stays up until it
 *   ends; onSpeak: typing, done, hidden or stopped for each line (to animate the speaker).
 * @returns {{ setReduced: (v: boolean) => void, refresh: () => void, play: () => void,
 *             stop: () => void }}
 */
export function attachSpeech(opts) {
  const { script, toCanvasCss } = opts;
  // the speaker's canvas; a function when the speaker changes (the gallery's guide and runner)
  const canvasOf = typeof opts.canvas === 'function' ? opts.canvas : () => opts.canvas;
  const canvas = canvasOf();
  const noop = { setReduced() {}, refresh() {}, play() {}, stop() {} };
  if (!canvas || !script || !script.length || !toCanvasCss) return noop;
  const scene = opts.scene || canvas;
  const container = opts.container || canvas.closest('section') || canvas.parentElement;
  const artPx = opts.artPx || (() => 2);
  const avoid = opts.avoid || [];
  const onSpeak = opts.onSpeak || (() => {});
  let reduced = Boolean(opts.reduced);

  const layer = document.createElement('div');
  layer.className = 'speech';
  layer.setAttribute('aria-hidden', 'true');
  const { bubble, text, shown, rest } = createBubble();
  layer.append(bubble);
  container.append(layer, createTranscript(script));

  const state = { index: -1, last: script.length - 1, phase: 'idle', elapsed: 0, finishedAt: -Infinity };
  let typed = ''; // the current line as set on screen
  let raf = 0;
  let last = 0;
  let pendingPlace = 0;

  const anchorOf = (line) => (Array.isArray(line.anchor) ? line.anchor : opts.head ? opts.head() : [0, 0]);
  const holdMs = (line) => (line.pause ?? DEFAULT_PAUSE_MS) + (reduced ? typingMs(line) : 0);

  // Horizontal room for the bubble in viewport coordinates.
  function room(cr) {
    const fenceEl = opts.bounds ? opts.bounds() : null;
    const fence = fenceEl ? fenceEl.getBoundingClientRect() : null;
    const viewport = document.documentElement.clientWidth;
    return {
      left: Math.max(cr.left, 0, fence ? fence.left : -Infinity) + EDGE_CSS,
      right: Math.min(cr.right, viewport, fence ? fence.right : Infinity) - EDGE_CSS,
    };
  }

  function place() {
    const line = script[state.index];
    if (!line || bubble.hidden) return;
    const p = snapToDevice(artPx());
    bubble.style.setProperty('--p', `${p}px`);
    const cr = container.getBoundingClientRect();
    const span = room(cr);
    // Measure with all the room, then hug the longest line.
    bubble.style.width = '';
    bubble.style.left = '0px';
    bubble.style.setProperty('--bubble-room', `${Math.max(0, span.right - span.left)}px`);
    const cs = getComputedStyle(bubble);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    bubble.style.width = `${Math.ceil(textWidth(text, bubble) + padX + 1)}px`;
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const vr = canvasOf().getBoundingClientRect();
    const a = toCanvasCss(anchorOf(line));
    const ax = vr.left - cr.left + a.x;
    const ay = vr.top - cr.top + a.y;
    const tailH = TAIL_UNITS.h * p;
    const minLeft = span.left - cr.left;
    const maxLeft = span.right - cr.left - bw;
    let left = clamp(ax - bw / 2, minLeft, Math.max(minLeft, maxLeft));
    let top = ay - GAP_CSS - tailH - bh;
    const above = { left: cr.left + left, right: cr.left + left + bw, top: cr.top + top, bottom: cr.top + top + bh };
    const roomAbove = top >= EDGE_CSS;
    let below = !roomAbove || avoid.some((el) => overlaps(el.getBoundingClientRect(), above));
    if (below) top = ay + GAP_CSS + tailH;
    if (below && roomAbove && opts.beside) {
      // Beside the speaker: to the right, or to the left; with room on neither side it stays
      // above rather than cover the speaker.
      const off = opts.beside();
      if (ax + off <= maxLeft) left = ax + off;
      else if (ax - off - bw >= minLeft) left = ax - off - bw;
      else {
        below = false;
        top = above.top - cr.top;
      }
    }
    bubble.classList.toggle('is-below', below);
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
    const tailX = clamp(ax - left, (TAIL_UNITS.w / 2 + 2) * p, bw - (TAIL_UNITS.w / 2 + 2) * p);
    bubble.style.setProperty('--tail-x', `${Math.round(tailX)}px`);
  }

  // Coalesce relayouts: scenes move their art in their own animation-frame callbacks.
  function refresh() {
    if (pendingPlace) return;
    pendingPlace = requestAnimationFrame(() => {
      pendingPlace = 0;
      place();
    });
  }

  function typeTo(n) {
    if (shown.textContent.length === n) return;
    shown.textContent = typed.slice(0, n);
    rest.textContent = typed.slice(n);
  }

  function showLine(i) {
    const line = script[i];
    state.index = i;
    state.phase = 'typing';
    state.elapsed = 0;
    typed = tieShortWords(line.text);
    shown.textContent = '';
    rest.textContent = typed;
    if (reduced) typeTo(typed.length);
    bubble.classList.remove('is-done');
    bubble.hidden = false;
    onSpeak(line, 'typing'); // first, so the anchor comes from the speaker's new pose
    place();
  }

  function hide(phase = 'hidden') {
    const line = script[state.index];
    if (!bubble.hidden && line) onSpeak(line, phase);
    bubble.hidden = true;
  }

  function next() {
    hide();
    if (state.index + 1 <= state.last) {
      showLine(state.index + 1);
      return;
    }
    state.phase = 'done';
    state.finishedAt = performance.now();
  }

  function step(dt) {
    state.elapsed += dt;
    if (state.phase === 'wait') {
      if (state.elapsed >= START_DELAY_MS) showLine(state.index + 1);
      return;
    }
    const line = script[state.index];
    if (!line) return;
    if (state.phase === 'typing') {
      const n = reduced ? typed.length : Math.min(typed.length, Math.floor((state.elapsed * cpsOf(line)) / 1000));
      typeTo(n);
      if (n >= typed.length) {
        state.phase = 'hold';
        state.elapsed = 0;
        bubble.classList.add('is-done');
        onSpeak(line, 'done');
      }
    } else if (state.phase === 'hold' && state.elapsed >= holdMs(line)) {
      const waiting = opts.busy && opts.busy() && state.elapsed < holdMs(line) + MAX_WAIT_MS;
      if (!waiting) next();
    }
  }

  const running = () => state.phase === 'wait' || state.phase === 'typing' || state.phase === 'hold';

  function frame(now) {
    step(Math.min(MAX_DT_MS, Math.max(0, now - last)));
    last = now;
    raf = running() ? requestAnimationFrame(frame) : 0;
  }

  // Lines first..last (the whole script by default), after a short beat.
  function play(first = 0, last = script.length - 1) {
    state.index = clamp(first, 0, script.length - 1) - 1;
    state.last = clamp(last, state.index + 1, script.length - 1);
    state.phase = 'wait';
    state.elapsed = 0;
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    hide('stopped');
    state.index = -1;
    state.phase = 'idle';
  }

  if (!opts.manual) {
    new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry.intersectionRatio >= PLAY_SHARE) {
          if (state.phase === 'idle' && performance.now() - state.finishedAt > REPLAY_AFTER_MS) play();
        } else if (!entry.isIntersecting && state.phase !== 'idle') {
          stop();
        }
      },
      { threshold: [0, PLAY_SHARE] },
    ).observe(scene);
  }
  new ResizeObserver(refresh).observe(container);

  return {
    setReduced(value) {
      reduced = value;
      if (reduced && state.phase === 'typing') typeTo(typed.length);
    },
    refresh,
    /**
     * Say lines first..last (the whole script by default) unless the bubble is already talking;
     * with interrupt, the line in progress gives way (the gallery: the visitor has moved on).
     * @param {number} [first]
     * @param {number} [last]
     * @param {boolean} [interrupt]
     */
    play(first, last, interrupt = false) {
      if (interrupt || !running()) play(first, last);
    },
    /** Hide the bubble and forget where the script was. */
    stop,
  };
}
