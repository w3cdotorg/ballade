export interface Player {
  /** Charge le fichier et résout avec la durée (secondes). */
  load(file: File): Promise<number>;
  play(): void;
  pause(): void;
  readonly audio: HTMLAudioElement;
}

/** Enveloppe <audio> ; onTick(currentTime) est appelé via requestAnimationFrame pendant la lecture. */
export function createPlayer(onTick: (t: number) => void): Player {
  const audio = new Audio();
  let raf = 0;
  const tick = () => {
    onTick(audio.currentTime);
    raf = requestAnimationFrame(tick);
  };
  audio.addEventListener('play', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  });
  audio.addEventListener('pause', () => cancelAnimationFrame(raf));
  audio.addEventListener('ended', () => {
    cancelAnimationFrame(raf);
    onTick(audio.duration);
  });
  return {
    audio,
    load(file) {
      audio.src = URL.createObjectURL(file);
      return new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => reject(new Error('Fichier audio illisible'));
      });
    },
    play: () => void audio.play(),
    pause: () => audio.pause(),
  };
}
