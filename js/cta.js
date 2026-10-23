// The floating «Обсудить съёмку»: shown once the first screen is scrolled past, hidden while the
// contact block (with its own button) or the footer is on screen.

export function createFloatingCta({ button, hero, hideOn }) {
  if (!button || !hero) return;
  button.hidden = false;
  let pastHero = false;
  const visible = new Set();
  const sync = () => button.classList.toggle('is-on', pastHero && visible.size === 0);
  new IntersectionObserver(([entry]) => {
    pastHero = !entry.isIntersecting;
    sync();
  }, { threshold: 0 }).observe(hero);
  const watch = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    sync();
  }, { threshold: 0.15 });
  hideOn.filter(Boolean).forEach((el) => watch.observe(el));
}
