export interface Player {
  /** Charge le fichier et résout avec la durée (secondes). */
  load(file: File): Promise<number>;
  play(): Promise<void>;
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
      // Setting audio.src pauses playback without firing a 'pause' event, so the rAF
      // tick loop would otherwise keep running (fighting the camera) after a mid-song swap.
      cancelAnimationFrame(raf);
      if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
      audio.src = URL.createObjectURL(file);
      return new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => reject(new Error('Unreadable audio file'));
      });
    },
    play: () => audio.play(),
    pause: () => audio.pause(),
  };
}

/** Lit la durée (s) d'un fichier audio via un <audio> jetable, sans toucher au lecteur principal. */
export function probeDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(probe.duration);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Unreadable audio file: ${file.name}`));
    };
    probe.src = url;
  });
}
