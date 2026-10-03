// Layout writes must happen outside ResizeObserver delivery. Otherwise resizing
// the canvas/scene can synchronously trigger another notification in that frame.
export function observePodiumSize(targets, resize) {
  let frame = 0, alive = true;
  const schedule = () => {
    if (!alive || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; if (alive) resize(); });
  };
  const observer = new ResizeObserver(schedule);
  targets.filter(Boolean).forEach(target => observer.observe(target));
  return { schedule, dispose() { alive = false; observer.disconnect(); cancelAnimationFrame(frame); frame = 0; } };
}
