# Statuts persistants & polis post-playlist — Design

Date : 2026-07-05
Statut : validé (brainstorming avec Clément)
Origine : minors différés des revues finales « vitesse constante » et « playlist ».

## Problèmes

1. La ligne de statut unique écrase les messages importants : l'offre de
   détour/couverture disparaît sous les statuts suivants, et lors d'un drop
   multi-fichiers l'erreur du fichier N est effacée par le « Loading… » du
   fichier N+1.
2. Après l'arrivée, éditer la playlist ou l'offset replace le curseur au
   départ (`journeyT` remis à 0 par `arrive()`), alors que le statut dit
   « Arrived! ».
3. Si le chargement d'une piste échoue en plein voyage, `playTrack` passe le
   voyage en `paused` ; la piste fautive est verrouillée, Resume ré-échoue —
   seul Reset s'en sort.

## Décisions

1. **Ligne d'offre persistante** (choix de Clément parmi 3 mécanismes) :
   - `index.html` : `<p id="offer" class="hint" hidden></p>` juste sous
     `#status` ; `controls.ts` : `offer: HTMLParagraphElement`.
   - `updateOffers()` devient l'unique propriétaire de la ligne : il y écrit
     le message applicable — priorité au détour (« The music outlasts the
     trip by ~X — add a scenic detour? »), sinon couverture (« Your playlist
     covers X of a ~Y trip — drop more songs anytime. ») — et la vide/cache
     (`hidden`) quand rien ne s'applique. Ces messages ne passent plus par
     `status()` ; la logique `wasHidden` de `updateDetourOffer` disparaît.
     L'offre reste affichée tant qu'elle tient.
   - **Drop multiple** : `addAudioFile` retourne `'added' | 'skipped'` au
     lieu de poser lui-même le statut d'erreur final ; les boucles appelantes
     (drop window + input `change`) accumulent et, quand il y a plus d'un
     fichier audio, posent un résumé final :
     `« N track(s) added · M skipped: a.xyz, b.foo »` (partie skipped omise
     si M = 0). Sont comptés « skipped » : les échecs de `probeDuration` ET
     les fichiers non supportés (`classifyFile` → unknown). Un seul
     fichier : statuts actuels inchangés.
2. **Curseur post-arrivée** : dans `rebuildSegments`, si
   `phase === 'arrived'`, le curseur se place à `state.route.total`
   (destination) au lieu de `distanceAtTime(journeyT, …)`.
3. **Piste illisible mi-voyage → sautée** : dans le catch du
   `player.load()` de `playTrack` (après la garde d'epoch) : statut
   `« Unreadable audio file — skipping “<label>”. »` puis
   `continueJourneyAt(track.start + track.duration)`. Des échecs en cascade
   convergent vers le silence ou l'arrivée (fenêtres finies).
4. **Micro-nettoyage** : traduire en français les 2 commentaires anglais
   hérités de `main.ts` (bloc zoom floor, fallback `'idle'` de
   `rebuildSegments`).

## Périmètre

`src/main.ts`, `index.html`, `src/ui/controls.ts` (± 2 lignes CSS pour
`#offer` si besoin de le distinguer). Aucune logique testable en pur : tout
est DOM/orchestration.

## Vérification

`npx tsc --noEmit` + suite Vitest (87 tests, inchangés) + smoke navigateur
ciblé : (a) drop de 3 fichiers dont 1 invalide → statut résumé + ligne
d'offre intacte ; (b) l'offre persiste après d'autres statuts et disparaît
quand elle ne s'applique plus (retrait de pistes) ; (c) curseur immobile à
destination quand on édite la playlist après l'arrivée ; (d) piste corrompue
insérée mi-playlist → sautée, le voyage continue. ESLint non configuré.
