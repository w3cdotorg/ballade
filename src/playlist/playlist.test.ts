import { describe, expect, it } from 'vitest';
import { createPlaylist } from './playlist';

// Node ≥ 20 fournit File ; le contenu importe peu, seul le nom sert d'étiquette.
const file = (name: string) => new File([], name);

describe('add / calage des fenêtres', () => {
  it('avant le départ (nowT=0) : bout à bout depuis 0', () => {
    const p = createPlaylist();
    p.add(file('a.mp3'), 200, 0);
    p.add(file('b.mp3'), 100, 0);
    expect(p.tracks().map((t) => t.start)).toEqual([0, 200]);
    expect(p.endOfMusic()).toBe(300);
    expect(p.totalMusic()).toBe(300);
  });

  it('pendant le silence (après toute la musique) : démarre à nowT', () => {
    const p = createPlaylist();
    p.add(file('a.mp3'), 200, 0);
    p.add(file('b.mp3'), 100, 350); // silence depuis t=200, ajout à t=350
    expect(p.tracks()[1].start).toBe(350);
  });

  it('pendant la lecture : se met en file après les pistes prévues', () => {
    const p = createPlaylist();
    p.add(file('a.mp3'), 200, 0);
    p.add(file('b.mp3'), 100, 50); // la piste a joue encore (fenêtre 0-200)
    expect(p.tracks()[1].start).toBe(200);
  });
});

describe('verrouillage', () => {
  it('verrouillée ssi start < nowT (strict) ; rien de verrouillé à l\'idle', () => {
    const p = createPlaylist();
    const a = p.add(file('a.mp3'), 200, 0);
    const b = p.add(file('b.mp3'), 100, 0);
    expect(p.isLocked(a.id, 0)).toBe(false);
    expect(p.isLocked(a.id, 50)).toBe(true);   // en cours de lecture
    expect(p.isLocked(a.id, 250)).toBe(true);  // passée
    expect(p.isLocked(b.id, 50)).toBe(false);  // future
  });
});

describe('remove / reorder / re-pack', () => {
  it('retire une piste future et re-cale les suivantes bout à bout', () => {
    const p = createPlaylist();
    p.add(file('a.mp3'), 200, 0);
    const b = p.add(file('b.mp3'), 100, 0);
    p.add(file('c.mp3'), 50, 0);
    expect(p.remove(b.id, 50)).toBe(true);
    expect(p.tracks().map((t) => t.start)).toEqual([0, 200]); // c re-calée après a
  });

  it('refuse de retirer une piste verrouillée', () => {
    const p = createPlaylist();
    const a = p.add(file('a.mp3'), 200, 0);
    expect(p.remove(a.id, 50)).toBe(false);
    expect(p.tracks()).toHaveLength(1);
  });

  it('moveUp/moveDown échangent deux pistes futures et re-calent', () => {
    const p = createPlaylist();
    p.add(file('a.mp3'), 200, 0);
    const b = p.add(file('b.mp3'), 100, 0);
    const c = p.add(file('c.mp3'), 50, 0);
    expect(p.moveUp(c.id, 50)).toBe(true);
    expect(p.tracks().map((t) => [t.file.name, t.start])).toEqual([
      ['a.mp3', 0], ['c.mp3', 200], ['b.mp3', 250],
    ]);
    expect(p.moveDown(c.id, 50)).toBe(true);
    expect(p.tracks().map((t) => t.file.name)).toEqual(['a.mp3', 'b.mp3', 'c.mp3']);
    expect(p.moveUp(b.id, 50)).toBe(false); // voisine du dessus verrouillée (a joue)
  });

  it('bornes : moveUp de la première, moveDown de la dernière → false', () => {
    const p = createPlaylist();
    const a = p.add(file('a.mp3'), 200, 0);
    expect(p.moveUp(a.id, 0)).toBe(false);
    expect(p.moveDown(a.id, 0)).toBe(false);
  });
});

describe('trackAt / trous historiques', () => {
  it('trouve la piste dont la fenêtre contient t, undefined dans un trou ou après', () => {
    const p = createPlaylist();
    p.add(file('a.mp3'), 200, 0);
    p.add(file('b.mp3'), 100, 350); // trou vécu 200-350
    expect(p.trackAt(0)?.file.name).toBe('a.mp3');
    expect(p.trackAt(199.9)?.file.name).toBe('a.mp3');
    expect(p.trackAt(200)).toBeUndefined();  // borne exclue + trou
    expect(p.trackAt(275)).toBeUndefined();  // trou historique
    expect(p.trackAt(350)?.file.name).toBe('b.mp3');
    expect(p.trackAt(450)).toBeUndefined();
  });
});

describe('repackFromZero / clear', () => {
  it('repackFromZero oublie les trous vécus : contigu depuis 0 dans l\'ordre de la liste', () => {
    const p = createPlaylist();
    p.add(file('a.mp3'), 200, 0);
    p.add(file('b.mp3'), 100, 350);
    p.repackFromZero();
    expect(p.tracks().map((t) => t.start)).toEqual([0, 200]);
  });

  it('clear vide tout à l\'idle, garde passées et courante pendant la lecture', () => {
    const p = createPlaylist();
    p.add(file('a.mp3'), 200, 0);
    p.add(file('b.mp3'), 100, 0);
    p.clear(50); // a joue (0-200), b est future
    expect(p.tracks().map((t) => t.file.name)).toEqual(['a.mp3']);
    p.clear(0);
    expect(p.tracks()).toHaveLength(0);
  });
});

describe('sélection / update', () => {
  it('l\'ajout sélectionne la piste ; remove de la sélection → dernière piste', () => {
    const p = createPlaylist();
    const a = p.add(file('a.mp3'), 200, 0);
    const b = p.add(file('b.mp3'), 100, 0);
    expect(p.selected()?.id).toBe(b.id);
    p.select(a.id);
    expect(p.selected()?.id).toBe(a.id);
    p.remove(a.id, 0);
    expect(p.selected()?.id).toBe(b.id);
  });

  it('update fusionne méta, paroles, statut et offset sans toucher aux fenêtres', () => {
    const p = createPlaylist();
    const a = p.add(file('a.mp3'), 200, 0);
    expect(a.lyricsStatus).toBe('searching');
    p.update(a.id, { artist: 'X', lyricsStatus: 'found', offset: 1.5 });
    expect(p.tracks()[0].artist).toBe('X');
    expect(p.tracks()[0].lyricsStatus).toBe('found');
    expect(p.tracks()[0].offset).toBe(1.5);
    expect(p.tracks()[0].start).toBe(0);
  });
});

describe('robustesse', () => {
  it('opérations sur un id inexistant : no-op ou false', () => {
    const p = createPlaylist();
    const a = p.add(file('a.mp3'), 100, 0);
    expect(p.remove(999, 0)).toBe(false);
    expect(p.moveUp(999, 0)).toBe(false);
    expect(p.moveDown(999, 0)).toBe(false);
    p.update(999, { artist: 'X' }); // ne jette pas
    p.select(999); // sélection inchangée
    expect(p.selected()?.id).toBe(a.id);
    expect(p.isLocked(999, 50)).toBe(false);
  });

  it('première piste ajoutée en plein silence (liste vide, nowT > 0) : démarre à nowT', () => {
    const p = createPlaylist();
    expect(p.add(file('a.mp3'), 100, 42).start).toBe(42);
  });
});
