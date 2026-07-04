import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSilentJourney } from './journeyClock';

// rAF simulé : file de callbacks qu'on « pompe » avec un horodatage choisi.
let queue: Map<number, FrameRequestCallback>;
let nextId: number;

beforeEach(() => {
  queue = new Map();
  nextId = 1;
  vi.stubGlobal('performance', { now: () => 0 });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
});
afterEach(() => vi.unstubAllGlobals());

function pump(nowMs: number): void {
  const pending = [...queue.values()];
  queue.clear();
  pending.forEach((cb) => cb(nowMs));
}

describe('startSilentJourney', () => {
  it('avance au rythme du temps réel à partir de `from`', () => {
    const ticks: number[] = [];
    startSilentJourney(10, 100, (t) => ticks.push(t), () => {});
    pump(1000);
    pump(2500);
    expect(ticks).toEqual([11, 12.5]);
  });

  it('clampe à `until`, appelle onArrive une fois et ne reprogramme plus de frame', () => {
    const ticks: number[] = [];
    const arrive = vi.fn();
    startSilentJourney(90, 100, (t) => ticks.push(t), arrive);
    pump(20000);
    expect(ticks).toEqual([100]);
    expect(arrive).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });

  it('cancel() stoppe les ticks et vide la frame en attente', () => {
    const ticks: number[] = [];
    const journey = startSilentJourney(0, 100, (t) => ticks.push(t), () => {});
    pump(1000);
    journey.cancel();
    pump(2000);
    expect(ticks).toEqual([1]);
    expect(queue.size).toBe(0);
  });
});
