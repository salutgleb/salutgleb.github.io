// Achievements as game badges: the artist's 48×48 plaque with a pictogram. Silver by default,
// gold for the tier: 'gold' achievements in team-data.js. Locked (greyed) until a list is mostly on
// screen, then each one flashes its highlighted plaque and settles. Gold badges then catch a
// light glint every few seconds, never two at once. With reduced motion they are open and still.

import { paintToSize } from './pixel-canvas.js';
import { createLoop } from './loop.js';
import { assetUrl, loadImage, warn } from './assets.js';
import { makeCanvas } from './draw.js';
import { tieShortWords } from './typo.js';

const PHONE_MAX_CSS = 700;
const BADGE_CSS = () => (window.innerWidth < PHONE_MAX_CSS ? 48 : 56);
const PACKAGE_BADGE_CSS = 76;
const UNLOCK_STEP_MS = 180;
const UNLOCK_FLASH_MS = 700; // the "just earned" plaque before it settles
const UNLOCK_THRESHOLD = 0.35;
const LOCKED_WASH = 'rgba(120, 124, 130, 0.55)';
const ICON_ALIASES = Object.freeze({ clapperboard: 'clapper' });

// The gold plaques are not in manifest-team.json (the artist rewrites that file), so they load
// by path. The glint is a strip of 48×48 frames: a light band sweeping over the rim.
const GOLD = Object.freeze({
  plaque: 'sprites/team/badge-gold.png',
  flash: 'sprites/team/badge-gold-highlighted.png',
  glint: 'sprites/team/badge-gold-glint.png',
});
const GLINT = Object.freeze({
  frameMs: 60,
  periodMs: 4500, // each gold badge glints once per period, the others shifted by a share of it
  firstAfterMs: 900, // after the unlock flash
});

async function loadIcons(list) {
  const icons = await Promise.all(
    list.map(async (icon) => {
      const image = icon.file ? await loadImage(assetUrl(icon.file)) : null;
      return image ? [icon.id, { image, x: Number(icon.x) || 0, y: Number(icon.y) || 0 }] : null;
    }),
  );
  return Object.fromEntries(icons.filter(Boolean));
}

/**
 * @typedef {{ draw: (pictogram: string, state: 'locked'|'open'|'flash', tier?: string,
 *             glintFrame?: number) => HTMLCanvasElement, glintFrames: number }} BadgeKit
 */

/**
 * The artist's kit from manifest-team.json (frames.unlocked / highlighted and icons at their own
 * x, y) plus the gold plaques, or null when the manifest has no badges yet.
 * @param {any} manifest
 * @returns {Promise<BadgeKit|null>}
 */
async function loadBadgeKit(manifest) {
  const kit = manifest && manifest.badges;
  if (!kit || !kit.frames || !Array.isArray(kit.icons)) return null;
  const frame = (key) => (kit.frames[key] ? loadImage(assetUrl(kit.frames[key].file)) : null);
  const [unlocked, highlighted, gold, goldFlash, glint, icons] = await Promise.all([
    frame('unlocked'),
    frame('highlighted'),
    loadImage(assetUrl(GOLD.plaque)),
    loadImage(assetUrl(GOLD.flash)),
    loadImage(assetUrl(GOLD.glint)),
    loadIcons(kit.icons),
  ]);
  if (!unlocked) return null;
  const w = unlocked.naturalWidth;
  const h = unlocked.naturalHeight;
  const plaques = Object.freeze({
    silver: { open: unlocked, flash: highlighted || unlocked },
    gold: gold ? { open: gold, flash: goldFlash || gold } : null,
  });
  if (!gold) warn('gold badge plaque missing, gold achievements stay silver');
  const glintFrames = gold && glint ? Math.floor(glint.naturalWidth / w) : 0;

  const draw = (pictogram, state, tier = 'silver', glintFrame = -1) => {
    const { canvas, ctx } = makeCanvas(w, h);
    const plaque = (tier === 'gold' && plaques.gold) || plaques.silver;
    ctx.drawImage(state === 'flash' ? plaque.flash : plaque.open, 0, 0);
    const icon = icons[ICON_ALIASES[pictogram] || pictogram] || icons.star;
    if (icon) ctx.drawImage(icon.image, icon.x, icon.y);
    if (state === 'locked') {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = LOCKED_WASH;
      ctx.fillRect(0, 0, w, h);
    } else if (plaque === plaques.gold && glintFrame >= 0 && glintFrame < glintFrames) {
      ctx.drawImage(glint, glintFrame * w, 0, w, h, 0, 0, w, h);
    }
    return canvas;
  };
  return { draw, glintFrames };
}

function paintBadge(badge, kit, state, glintFrame = -1) {
  const image = kit.draw(badge.pictogram, state, badge.tier, glintFrame);
  paintToSize(badge.canvas, image, image.width, image.height, BADGE_CSS(), 'w');
  badge.li.classList.toggle('is-open', state !== 'locked');
}

function renderMember(member, kit, reduced) {
  const host = document.getElementById(`member-${member.id}`);
  const list = host && host.querySelector('.achievements');
  if (!list) return [];
  const badges = member.achievements.map((a) => {
    const li = document.createElement('li');
    li.className = 'ach';
    if (a.tier) li.dataset.tier = a.tier;
    const canvas = document.createElement('canvas');
    canvas.className = 'pixel ach__badge';
    canvas.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'ach__title';
    title.textContent = tieShortWords(a.title);
    const text = document.createElement('p');
    text.className = 'ach__text mono';
    text.textContent = tieShortWords(a.text);
    body.append(title, text);
    li.append(canvas, body);
    return { canvas, li, pictogram: a.badge, tier: a.tier || 'silver', host };
  });
  list.replaceChildren(...badges.map((b) => b.li));
  badges.forEach((b) => paintBadge(b, kit, reduced ? 'open' : 'locked'));
  return badges;
}

// Each list unlocks its badges one by one the first time it is mostly on screen (no flash if
// reduced motion was switched on in the meantime).
function unlockOnView(badges, kit, onOpen, isReduced) {
  const list = badges.length && badges[0].host.querySelector('.achievements');
  if (!list) return;
  const open = (badge) => {
    paintBadge(badge, kit, 'open');
    onOpen(badge);
  };
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      badges.forEach((badge, i) => {
        setTimeout(() => {
          if (isReduced()) {
            open(badge);
            return;
          }
          paintBadge(badge, kit, 'flash');
          setTimeout(() => open(badge), UNLOCK_FLASH_MS);
        }, (i + 1) * UNLOCK_STEP_MS);
      });
    },
    { threshold: UNLOCK_THRESHOLD },
  );
  observer.observe(list);
}

// One clock for all gold badges, running only while the lists are on screen. Badge i of n glints
// when (t - i * period / n) mod period falls inside the sweep, so two never glint together.
function createGlints(watch, kit, gold, reducedAtStart) {
  const sweepMs = kit.glintFrames * GLINT.frameMs;
  const states = gold.map((badge, i) => ({ badge, offset: (i * GLINT.periodMs) / gold.length, readyAt: null, frame: -1 }));
  let reduced = reducedAtStart;
  let t = 0;

  const paint = (s, frame) => {
    if (frame === s.frame) return;
    s.frame = frame;
    paintBadge(s.badge, kit, 'open', frame);
  };

  if (sweepMs && states.length) {
    createLoop(watch, (dt) => {
      t += dt;
      if (reduced) return;
      states.forEach((s) => {
        if (s.readyAt === null || t < s.readyAt) return;
        const local = (((t - s.offset) % GLINT.periodMs) + GLINT.periodMs) % GLINT.periodMs;
        const inSweep = local < sweepMs && t - local >= s.readyAt; // never start halfway through
        paint(s, inSweep ? Math.floor(local / GLINT.frameMs) : -1);
      });
    });
  }

  return {
    opened(badge) {
      const s = states.find((x) => x.badge === badge);
      if (s) s.readyAt = t + GLINT.firstAfterMs;
    },
    setReduced(value) {
      reduced = value;
      states.forEach((s) => {
        if (value) paint(s, -1);
        else if (s.readyAt === null && s.badge.li.classList.contains('is-open')) s.readyAt = t + GLINT.firstAfterMs;
      });
    },
  };
}

/**
 * Render every member's achievements, unlock them on view, run the gold glints, and paint the
 * badge used as a package icon (data-badge on .package__icon).
 * @param {{ manifest: any, team: ReadonlyArray<any>, reduced: boolean, watch: Element }} opts
 * @returns {Promise<{ setReduced: (v: boolean) => void }>}
 */
export async function createAchievements({ manifest, team, reduced, watch }) {
  const loaded = await loadBadgeKit(manifest);
  const kit =
    loaded ||
    (await import('./placeholder-team.js').then((ph) => ({
      draw: (id, state) => ph.placeholderBadge(id, state !== 'locked'),
      glintFrames: 0,
    })));
  if (!loaded) warn('badge kit not ready, drawing placeholder badges');

  let reducedNow = reduced;
  const perMember = team.map((member) => renderMember(member, kit, reduced));
  const all = perMember.flat();
  const glints = createGlints(watch, kit, all.filter((b) => b.tier === 'gold'), reduced);
  if (reduced) all.forEach((badge) => glints.opened(badge));
  else perMember.forEach((badges) => unlockOnView(badges, kit, glints.opened, () => reducedNow));

  document.querySelectorAll('.package__icon[data-badge]').forEach((canvas) => {
    const image = kit.draw(canvas.dataset.badge, 'open');
    paintToSize(canvas, image, image.width, image.height, PACKAGE_BADGE_CSS);
  });

  return {
    setReduced(value) {
      reducedNow = value;
      if (value) all.forEach((badge) => paintBadge(badge, kit, 'open'));
      glints.setReduced(value);
    },
  };
}
