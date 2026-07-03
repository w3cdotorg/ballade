import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchLyrics } from './lrclib';

afterEach(() => vi.unstubAllGlobals());

describe('searchLyrics', () => {
  it('choisit le candidat synchronisé à la durée la plus proche', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { syncedLyrics: null, duration: 180 },
        { syncedLyrics: '[00:01.00]Loin', duration: 300 },
        { syncedLyrics: '[00:01.00]Proche', duration: 182 },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);
    const hit = await searchLyrics('Artiste', 'Titre', 180);
    expect(String(fetchMock.mock.calls[0][0])).toContain('lrclib.net/api/search');
    expect(hit).toEqual({ lrc: '[00:01.00]Proche', duration: 182 });
  });

  it("renvoie null quand aucun résultat n'a de paroles synchronisées", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ syncedLyrics: null, duration: 100 }],
    }));
    expect(await searchLyrics('A', 'B')).toBeNull();
  });

  it('jette une erreur sur statut HTTP non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(searchLyrics('A', 'B')).rejects.toThrow('lrclib: HTTP 500');
  });
});
