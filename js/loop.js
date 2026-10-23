// requestAnimationFrame loop that only runs while its element is on screen and the tab
// is visible. The frame callback gets a clamped delta, so time does not jump after a pause.

const MAX_DT_MS = 100;

/**
 * @param {Element} element watched for visibility
 * @param {(dtMs: number, nowMs: number) => void} frame
 * @returns {{ running: () => boolean, refresh: () => void }}
 */
export function createLoop(element, frame) {
  let onScreen = false;
  let rafId = 0;
  let last = 0;

  const tick = (now) => {
    const dt = Math.min(MAX_DT_MS, Math.max(0, now - last));
    last = now;
    frame(dt, now);
    rafId = requestAnimationFrame(tick);
  };

  const refresh = () => {
    const shouldRun = onScreen && !document.hidden;
    if (shouldRun && !rafId) {
      last = performance.now();
      rafId = requestAnimationFrame(tick);
    } else if (!shouldRun && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      refresh();
    },
    { rootMargin: '64px 0px' },
  );
  observer.observe(element);
  document.addEventListener('visibilitychange', refresh);

  return { running: () => rafId !== 0, refresh };
}
