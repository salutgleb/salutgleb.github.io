// Boot: load the manifests, record the kit physics once, start the scenes, follow the theme.

import { GALLERY_ON } from './config.js';
import { loadJSON, loadItems, spriteOf, warn } from './assets.js';
import { loadPacking, createPacking } from './packing.js';
import { loadRunner } from './runner.js';
import { createStudio, loadStudio } from './studio.js';
import { createTeam } from './team.js';
import { createShowreel } from './showreel.js';
import { createContact } from './contact.js';
import { createFloatingCta } from './cta.js';
import { loadMembers } from './avatars.js';
import { attachStudioSpeech } from './studio-speech.js';
import { sampleWord } from './word.js';
import { paintToSize } from './pixel-canvas.js';
import { prefersReducedMotion } from './util.js';
import { initTheme, onThemeChange, currentTheme } from './theme.js';

const $ = (selector) => document.querySelector(selector);
async function startStudio(manifest, reduced) {
  const scene = await loadStudio(manifest);
  if (!scene) warn('manifest-studio.json not ready, drawing the placeholder studio');
  const placeholder = scene ? null : await import('./placeholder-studio.js');
  const hero = $('#studio');
  const studio = createStudio({
    placeholder,
    hero,
    wrap: $('.hero__scene'),
    canvas: $('#studio-canvas'),
    text: $('.hero__text'),
    hint: $('.hero__hint'),
    scene,
    reduced,
  });
  if (new URLSearchParams(window.location.search).has('debug')) window.salutStudio = studio;
  if (!scene) return studio; // the speech anchors belong to the artist's studio
  // Gleb's lines as the operator; a bubble never covers the headline or the buttons.
  const speech = attachStudioSpeech({ studio, canvas: $('#studio-canvas'), hero, avoid: [$('.hero__text')].filter(Boolean), reduced });
  return {
    setReduced(value) {
      studio.setReduced(value);
      speech.setReduced(value);
    },
  };
}

// The kit: the packing diorama. Gleb runs the six things into a bottomless box, lights the fuse,
// and the box goes up as the site's salute. (The older falling-kit scene, kit-*.js and box.js,
// stays in the repo but is not loaded.)
async function startPacking(reduced) {
  const [art, runner, word] = await Promise.all([loadPacking(), loadRunner(), sampleWord('САЛЮТ')]);
  if (!art || !runner) throw new Error('packing art or runner missing');
  const scene = createPacking({
    section: $('#kit'),
    stage: $('.pack__stage'),
    sceneEl: $('.pack__scene'),
    canvas: $('#pack-canvas'),
    dom: {
      count: $('#pack-count'),
      total: $('#pack-total'),
      list: $('#pack-list'),
      tag: $('#pack-tag'),
      status: $('#pack-status'),
      replay: $('#pack-replay'),
    },
    art,
    runner,
    word,
    reduced,
  });
  if (new URLSearchParams(window.location.search).has('debug')) window.packDebug = scene.debug;
  return scene;
}

const PACKAGE_ICON_CSS = 96; // icon height in a package card

function paintPackageIcons(items) {
  const find = (key) => items.find((it) => it.id === key) || items.find((it) => it.id.includes(key));
  document.querySelectorAll('.package__icon[data-icon]').forEach((canvas) => {
    const item = find(canvas.dataset.icon);
    if (item) paintToSize(canvas, spriteOf(item, currentTheme() === 'dark'), item.w, item.h, PACKAGE_ICON_CSS);
    else canvas.hidden = true;
  });
}

async function main() {
  document.documentElement.classList.add('js');
  try {
    sessionStorage.removeItem('salut-retry');
  } catch (error) {
    // storage blocked: nothing to clear
  }
  initTheme();
  createFloatingCta({ button: $('#float-cta'), hero: $('#studio'), hideOn: [$('#contact'), $('.footer')] });
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = prefersReducedMotion();
  const [itemsManifest, studioManifest, teamManifest] = await Promise.all([
    loadJSON('assets/manifest-items.json'),
    loadJSON('assets/manifest-studio.json'),
    loadJSON('assets/manifest-team.json'),
  ]);
  // Gleb and Sonya's sprites serve the team, the showreel presenter and the contact block.
  const members = loadMembers(teamManifest).catch((error) => {
    warn('team members failed', error);
    return null;
  });
  const items = await loadItems(itemsManifest);
  paintPackageIcons(items);
  onThemeChange(() => paintPackageIcons(items));

  const withMembers = (name, start) =>
    members.then(start).catch((error) => {
      warn(`${name} failed`, error);
      return null;
    });
  const scenes = await Promise.all([
    withMembers('showreel', (m) => ($('#showreel') ? createShowreel({ section: $('#showreel'), reduced, presenter: m && m.gleb }) : null)),
    startStudio(studioManifest, reduced).catch((error) => warn('studio failed', error)),
    withMembers('team', (m) => createTeam(teamManifest, m, reduced)),
    withMembers('contact', (m) => createContact({ section: $('#contact'), member: m && m.gleb, reduced })),
    // «Билет в галерею» replaces the «Работы» list once GALLERY_ON is set (?gallery to check it).
    GALLERY_ON || new URLSearchParams(window.location.search).has('gallery')
      ? withMembers('gallery', (m) =>
          import('./gallery.js').then(({ createGallery }) =>
            createGallery({ section: $('#works'), oldList: $('.works'), member: m && m.gleb, reduced }),
          ),
        )
      : null,
    startPacking(reduced).catch((error) => {
      warn('kit failed', error);
      document.documentElement.classList.add('kit-failed');
    }),
  ]);
  motionQuery.addEventListener('change', (event) => {
    scenes.forEach((scene) => scene && scene.setReduced(event.matches));
  });
}

main().catch((error) => warn('boot failed', error));
