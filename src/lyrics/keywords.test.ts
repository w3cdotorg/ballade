import { describe, expect, it } from 'vitest';
import { extractKeywords, tokenize } from './keywords';

describe('tokenize', () => {
  it('minuscules, accents retirés, mots courts et mots-outils exclus', () => {
    expect(tokenize('Sous le pont Mirabeau coule la Seine')).toEqual([
      'pont',
      'mirabeau',
      'coule',
      'seine',
    ]);
  });

  it('retire les accents (rivière → riviere)', () => {
    expect(tokenize('La rivière')).toEqual(['riviere']);
  });

  it("coupe sur les apostrophes (d'amour → amour)", () => {
    expect(tokenize("d'amour")).toEqual(['amour']);
  });

  it('filtre les mots-outils anglais', () => {
    expect(tokenize('When the river runs')).toEqual(['river', 'runs']);
  });
});

describe('extractKeywords', () => {
  it('agrège les mots de toutes les lignes, dédupliqués', () => {
    const kw = extractKeywords([
      { start: 0, end: 2, text: 'Le jardin, le jardin' },
      { start: 2, end: 4, text: 'Et la mer' },
    ]);
    expect(kw).toEqual(new Set(['jardin', 'mer']));
  });
});
