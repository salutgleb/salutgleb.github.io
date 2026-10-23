// The hero dialogue: Gleb, the operator in the studio, says his lines (speech-lines.js) and acts
// them out with the artist's gestures (manifest-studio.json `operator_loops`). Each line names
// the operator's roles while it types and once it is done. A gesture plays through once and holds
// its last frame; the next role waits for it, and the finished line stays up until it ends. With
// reduced motion he holds the last frame of his wave (turned to us) while the lines are up, then
// films again. A role the art lacks falls back to his idle loop.

import { attachSpeech } from './speech.js';
import { LINES, STUDIO_OPERATOR_HEAD, STUDIO_HEAD_IN_BOX } from './speech-lines.js';

const rolesFor = (line, phase) => [].concat((line.roles || {})[phase] || []);

/**
 * @param {{ studio: ReturnType<import('./studio.js').createStudio>, canvas: HTMLCanvasElement,
 *           hero: HTMLElement, avoid: Element[], reduced: boolean }} opts
 * @returns {{ setReduced: (v: boolean) => void }}
 */
export function attachStudioSpeech({ studio, canvas, hero, avoid, reduced }) {
  const script = LINES.studio;
  const last = script[script.length - 1];
  let isReduced = reduced;
  let speech = null;

  // Over his head: the artist's anchor, else a fixed point of his crop box (all poses share it).
  const head = () => {
    const box = studio.actorBox();
    if (!box) return STUDIO_OPERATOR_HEAD;
    return box.anchor || [box.x + STUDIO_HEAD_IN_BOX[0], box.y + STUDIO_HEAD_IN_BOX[1]];
  };

  const act = (line, phase) => {
    if (phase === 'stopped') studio.rest();
    else if (isReduced) {
      if (phase === 'hidden' && line === last) studio.rest();
      else if (phase !== 'hidden') studio.hold('wave');
    } else if (phase === 'hidden') {
      if (line === last) studio.act(['idle']); // after turn_back, if it still plays
    } else {
      const roles = rolesFor(line, phase);
      if (roles.length) studio.act(roles);
    }
    if (speech) speech.refresh(); // the bubble follows his head into the new pose
  };

  speech = attachSpeech({
    canvas,
    script,
    toCanvasCss: studio.project,
    artPx: studio.artPx,
    head,
    scene: hero,
    container: hero,
    avoid,
    reduced,
    busy: () => studio.busy(),
    onSpeak: act,
  });
  studio.onLayout(speech.refresh);

  return {
    setReduced(value) {
      isReduced = value;
      speech.setReduced(value);
      if (value) studio.rest();
    },
  };
}
