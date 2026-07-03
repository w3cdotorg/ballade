import { describe, expect, it } from 'vitest';
import { readTrackMeta } from './metadata';

describe('readTrackMeta', () => {
  it('renvoie {} sur un fichier illisible plutôt que de jeter', async () => {
    const junk = new File([new Uint8Array([1, 2, 3, 4])], 'x.mp3', { type: 'audio/mpeg' });
    expect(await readTrackMeta(junk)).toEqual({});
  });
});
