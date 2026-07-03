import { describe, expect, it } from 'vitest';
import { parseVtt } from './vttParser';

const VTT = `WEBVTT

00:01.000 --> 00:04.000
Bonjour et bienvenue

00:04.500 --> 00:08.000
dans ce <b>podcast</b>
sur les cartes`;

const SRT = `1
00:00:01,000 --> 00:00:04,000
Bonjour et bienvenue

2
00:00:04,500 --> 00:00:08,000
dans ce podcast`;

describe('parseVtt', () => {
  it('parse le WebVTT, fusionne les lignes multiples et retire les balises', () => {
    expect(parseVtt(VTT)).toEqual([
      { start: 1, end: 4, text: 'Bonjour et bienvenue' },
      { start: 4.5, end: 8, text: 'dans ce podcast sur les cartes' },
    ]);
  });

  it('parse le SRT (virgule décimale, heures)', () => {
    expect(parseVtt(SRT)).toEqual([
      { start: 1, end: 4, text: 'Bonjour et bienvenue' },
      { start: 4.5, end: 8, text: 'dans ce podcast' },
    ]);
  });

  it('renvoie [] sur une entrée sans cue', () => {
    expect(parseVtt('WEBVTT\n\nNOTE rien ici')).toEqual([]);
  });
});
