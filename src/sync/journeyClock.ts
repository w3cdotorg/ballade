export interface SilentJourney {
  /** Interrompt la progression (pause ou reset) ; idempotent. */
  cancel(): void;
}

/**
 * Phase silencieuse du voyage : la chanson est finie mais la destination pas
 * atteinte. Fait avancer le temps de voyage au rythme du temps réel, de `from`
 * à `until` (secondes), via requestAnimationFrame. Appelle onTick(t) à chaque
 * frame, puis onTick(until) et onArrive() à l'arrivée.
 */
export function startSilentJourney(
  from: number,
  until: number,
  onTick: (t: number) => void,
  onArrive: () => void,
): SilentJourney {
  const t0 = performance.now();
  let raf = 0;
  let done = false;
  const frame = (now: number): void => {
    if (done) return;
    const t = from + (now - t0) / 1000;
    if (t >= until) {
      done = true;
      onTick(until);
      onArrive();
      return;
    }
    onTick(t);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    cancel() {
      done = true;
      cancelAnimationFrame(raf);
    },
  };
}
