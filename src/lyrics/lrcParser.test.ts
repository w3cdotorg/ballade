import { describe, expect, it } from 'vitest';
import { parseLrc } from './lrcParser';

const SAMPLE = `[ti:Test]
[00:10.00]Première ligne
[00:20.50]Deuxième ligne

[00:05.00]Ligne d'intro`;

describe('parseLrc', () => {
  it('parse, trie par timestamp et chaîne les fins', () => {
    expect(parseLrc(SAMPLE, 30)).toEqual([
      { start: 5, end: 10, text: "Ligne d'intro" },
      { start: 10, end: 20.5, text: 'Première ligne' },
      { start: 20.5, end: 30, text: 'Deuxième ligne' },
    ]);
  });

  it('gère plusieurs timestamps sur une même ligne (refrains)', () => {
    expect(parseLrc('[00:01.00][00:03.00]Refrain', 5)).toEqual([
      { start: 1, end: 3, text: 'Refrain' },
      { start: 3, end: 5, text: 'Refrain' },
    ]);
  });

  it('ignore les métadonnées, lignes vides et timestamps sans texte', () => {
    expect(parseLrc('[ar:Artiste]\n[00:01.00]\n\n', 10)).toEqual([]);
  });
});
