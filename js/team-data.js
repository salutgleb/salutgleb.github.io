// Who films, and their achievements (Gleb's list, wording from docs/copy-draft.md section 3, 23.10.2026).
// badge: camera | mic | play | star | clapper | iphone (the artist's pictograms)
// tier: 'gold' for the two «2 года» achievements (Gleb, 23.10.2026), silver otherwise

export const TEAM = Object.freeze([
  Object.freeze({
    id: 'gleb',
    name: 'Глеб',
    role: 'Видеограф',
    // Three each, to keep the page short (Gleb 23.10: «оч долго сам сайт листается»).
    achievements: Object.freeze([
      { badge: 'camera', tier: 'gold', title: '2 года в видеографии', text: 'Съёмка и монтаж.' },
      { badge: 'mic', title: 'Интервью и обзоры', text: '«Персона Грата», канал nolimit, Росатом.' },
      { badge: 'clapper', title: 'Сценарии и ИИ-аватары', text: 'Пишет до съёмки, аватары делаем с Соней.' },
    ]),
  }),
  Object.freeze({
    id: 'sonya',
    name: 'Соня',
    role: 'Рилсмейкер и SMM',
    achievements: Object.freeze([
      { badge: 'star', tier: 'gold', title: '2 года в SMM', text: 'Соцсети и контент.' },
      { badge: 'iphone', title: 'Рилсы целиком', text: 'Сценарий, съёмка на iPhone и монтаж 9:16.' },
      { badge: 'clapper', title: 'Продюсирование', text: 'Организует съёмки.' },
    ]),
  }),
]);
