// One qualified exposure per profile and leaderboard view. Runtime dependencies
// are injectable so scrolling, tab switches and consent revocation are testable.
export function nameExposureTracker(send: (id: string) => void, eligible: (id: string) => boolean, clock = {
  schedule: (fn: () => void) => setTimeout(fn, 1000),
  cancel: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
}) {
  const seen = new Set<string>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const leave = (id: string) => { const timer = pending.get(id); if (timer !== undefined) clock.cancel(timer); pending.delete(id); };
  return {
    observe(id: string, fullyVisible: boolean) {
      if (!fullyVisible || !eligible(id)) { leave(id); return; }
      if (seen.has(id) || pending.has(id)) return;
      pending.set(id, clock.schedule(() => {
        pending.delete(id);
        if (!eligible(id)) return;
        seen.add(id); send(id);
      }));
    },
    pause() { for (const id of pending.keys()) leave(id); },
  };
}
