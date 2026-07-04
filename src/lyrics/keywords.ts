import type { LyricLine } from './types';

// Mots-outils FR/EN (formes déjà normalisées : minuscules, sans accents).
// Volontairement large sur les remplissages de paroles (yeah, baby, gonna…).
const STOPWORDS = new Set([
  // français
  'les', 'des', 'une', 'son', 'ses', 'mes', 'tes', 'nos', 'vos', 'est', 'ont',
  'pas', 'sur', 'par', 'que', 'qui', 'quoi', 'moi', 'toi', 'lui', 'eux', 'aux',
  'ces', 'dans', 'avec', 'pour', 'sans', 'sous', 'mais', 'tout', 'toute',
  'tous', 'toutes', 'elle', 'elles', 'nous', 'vous', 'ils', 'leur', 'leurs',
  'cette', 'comme', 'plus', 'moins', 'bien', 'encore', 'jamais', 'toujours',
  'quand', 'alors', 'ainsi', 'autre', 'etre', 'avoir', 'fait', 'faire', 'suis',
  'etait', 'sont', 'sera', 'peut', 'rien', 'chaque', 'depuis', 'entre', 'vers',
  'chez', 'tres', 'aussi', 'meme', 'deja', 'donc', 'puis', 'cela',
  // anglais
  'the', 'and', 'you', 'are', 'was', 'not', 'but', 'for', 'all', 'out', 'she',
  'him', 'her', 'his', 'its', 'our', 'who', 'how', 'why', 'get', 'got', 'let',
  'can', 'one', 'now', 'too', 'that', 'this', 'with', 'from', 'your', 'have',
  'will', 'when', 'what', 'they', 'them', 'then', 'than', 'were', 'been',
  'being', 'just', 'only', 'over', 'into', 'some', 'more', 'most', 'very',
  'much', 'many', 'still', 'again', 'never', 'always', 'about', 'after',
  'before', 'where', 'which', 'while', 'would', 'could', 'should', 'there',
  'their', 'these', 'those', 'here', 'dont', 'cant', 'wont', 'aint', 'yeah',
  'baby', 'gonna', 'wanna', 'gotta', 'ooh', 'whoa', 'woah', 'hey',
]);

/** Mots normalisés d'un texte : minuscules, sans accents, ≥ 3 lettres, hors mots-outils. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Vocabulaire dédupliqué de toutes les lignes de paroles. */
export function extractKeywords(lines: readonly LyricLine[]): Set<string> {
  return new Set(lines.flatMap((l) => tokenize(l.text)));
}
