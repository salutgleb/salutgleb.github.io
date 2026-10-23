// What the characters say in each scene (docs/copy-draft.md section 9). Every line marked
// draft: true waits for Gleb's approval.
// anchor: the speaker's head in the scene's own art px (the bubble's tail points there).
// pause: how long the finished line stays, in ms.
//
// Hook for the kit and box scene (js/kit-*.js belongs to another agent): `kit` is filled, call
//   const speech = attachSpeech({ canvas, script: LINES.kit, toCanvasCss, artPx, head,
//                                 container: stageEl, manual: true, reduced });
//   speech.play(0, 0); // at the scroll moment a line belongs to; speech.stop() to hide it
// toCanvasCss maps the box scene's art px to CSS px from its canvas's top left corner; call
// speech.refresh() after the stage relayouts. See js/speech.js for the other options.

// The operator's head (scene art px of the studio): inside the crop box his poses share (the
// artist: in the turned poses the head sits at about box x 14-30, y 0-16), or, for studio art
// without operator roles, a fixed point.
export const STUDIO_HEAD_IN_BOX = Object.freeze([22, 0]);
export const STUDIO_OPERATOR_HEAD = Object.freeze([82, 75]);

export const LINES = Object.freeze({
  // The hero studio: Gleb is the operator. He turns his head over his shoulder (hands stay on the
  // camera) and talks: his mouth moves while a line types (wave, shh, talk), he listens with a
  // blink in between (point), then turns back to his camera. roles: what he plays while a line
  // types and once it is done (js/studio-speech.js). Gestures play once and hold their last frame;
  // a role that is already playing goes on; a list plays in order. A line stays up until its
  // gesture ends, pause is the minimum. «Тихо, идёт запись» types slower, as a whisper.
  studio: Object.freeze([
    { speaker: 'Глеб', text: 'Салют!', anchor: 'head', roles: { typing: 'wave' }, pause: 1000, draft: true },
    { speaker: 'Глеб', text: 'Тихо, идёт запись.', anchor: 'head', cps: 18, roles: { typing: 'shh', done: 'point' }, pause: 1500, draft: true },
    {
      speaker: 'Глеб',
      text: 'Гостю остаётся только говорить. Свет, звук и монтаж за нами.',
      anchor: 'head',
      roles: { typing: 'talk', done: ['turn_back', 'idle'] },
      pause: 3200,
      draft: true,
    },
  ]),
  showreel: Object.freeze([
    { speaker: 'Глеб', text: 'Тридцать секунд, я засекал.', anchor: 'head', pause: 2200, draft: true },
    { speaker: 'Глеб', text: 'Со звуком лучше. Кнопка под экраном.', anchor: 'head', pause: 3200, draft: true },
  ]),
  team: Object.freeze([
    { speaker: 'Глеб', text: 'Монтирую. Вырезаю лишние «эээ».', anchor: [160, 97], pause: 2600, draft: true },
    { speaker: 'Соня', text: 'Дубль двенадцать. Этот точно последний.', anchor: [256, 103], pause: 3000, draft: true },
  ]),
  contact: Object.freeze([
    { speaker: 'Глеб', text: 'Пишите сюда, отвечаю сам.', anchor: 'head', pause: 2200, draft: true },
    { speaker: 'Глеб', text: 'Можно одной фразой, остальное спрошу.', anchor: 'head', pause: 3200, draft: true },
  ]),
  // «Билет в галерею» (js/gallery.js): 0 after the ticket is punched (CRACE is first on the wall),
  // 1–5 when the wall rests on that work (GALLERY_LINE_FOR in gallery.js), 6 at the end of the
  // wall, right after the last work's line, pointing to the Yandex Disk link (the exit card is
  // gone, Gleb 23.10: «чисто работы оставим»). Gleb 23.10: «добавим фразочек аватару».
  gallery: Object.freeze([
    { speaker: 'Глеб', text: 'Проходите. Начнём со спорта.', anchor: 'head', pause: 2600, draft: true },
    { speaker: 'Глеб', text: 'Студия: ведущий, свет и кроссовки крупно.', anchor: 'head', pause: 2400, draft: true },
    { speaker: 'Глеб', text: 'Три ракурса, чтобы видеть и ответы, и реакции.', anchor: 'head', pause: 2600, draft: true },
    { speaker: 'Глеб', text: 'Дальше рилсы. Лучше не на голодный желудок.', anchor: 'head', pause: 2600, draft: true },
    { speaker: 'Глеб', text: 'Мероприятия тоже снимаем, от регистрации до общего фото.', anchor: 'head', pause: 2800, draft: true },
    { speaker: 'Глеб', text: 'Аниматоры, игры, кольцеброс. Снимали всё, что двигалось.', anchor: 'head', pause: 2800, draft: true },
    { speaker: 'Глеб', text: 'Остальные работы на Яндекс Диске, ссылка наверху.', anchor: 'head', pause: 3600, draft: true },
  ]),
  // The box scene: line 0 when all six things are in (play(0, 0)), line 1 before the fuse (play(1, 1)).
  kit: Object.freeze([
    { speaker: 'Глеб', text: 'Шесть из шести. Пересчитаю ещё раз.', anchor: 'head', pause: 2600, draft: true },
    { speaker: 'Глеб', text: 'Отойдите на шаг, фитиль короткий.', anchor: 'head', pause: 2400, draft: true },
  ]),
});
