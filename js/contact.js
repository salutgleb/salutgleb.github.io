// Contact block: Gleb stands next to the heading and says one line (his mouth moves while it
// types) when the block is on screen.

import { preferredScale } from './pixel-canvas.js';
import { createAvatar } from './avatars.js';
import { attachSpeech } from './speech.js';
import { LINES } from './speech-lines.js';

/**
 * @param {{ section: HTMLElement|null, member: any, reduced: boolean }} opts member: Gleb's scene
 *   from avatars.js loadMembers; without it the block shows no character
 * @returns {{ setReduced: (v: boolean) => void } | null}
 */
export function createContact({ section, member, reduced }) {
  const canvas = section && section.querySelector('.contact__gleb');
  if (!canvas) return null;
  if (!member) {
    canvas.hidden = true;
    return null;
  }
  let speech = null;
  const avatar = createAvatar(canvas, member, {
    scale: preferredScale,
    reduced,
    roles: ['talk'],
    observe: section,
    onLayout: () => speech && speech.refresh(),
  });
  speech = attachSpeech({
    canvas,
    script: LINES.contact,
    toCanvasCss: avatar.project,
    artPx: avatar.artPx,
    head: avatar.head,
    scene: section.querySelector('.contact__head') || section,
    container: section,
    reduced,
    onSpeak: (_line, phase) => avatar.setRole(phase === 'typing' ? 'talk' : 'idle'),
  });
  return {
    setReduced(value) {
      avatar.setReduced(value);
      speech.setReduced(value);
    },
  };
}
