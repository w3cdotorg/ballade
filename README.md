# Lyric Route

Les paroles de ce que tu écoutes, écrites le long de ton trajet sur la carte.

## Démarrer

    npm install
    npm run dev

## Utilisation

1. **Trajet** — clique un départ et une arrivée sur la carte (ou cherche une adresse),
   choisis le mode (à pied / vélo / voiture).
2. **Musique** — charge un fichier audio. Les paroles synchronisées sont cherchées
   automatiquement sur [lrclib.net](https://lrclib.net) via les tags du fichier ;
   sinon fournis un `.lrc` (musique) ou `.srt`/`.vtt` (podcast).
3. **Lecture** — le voyage démarre : la caméra suit ta position simulée, les paroles
   à venir sont devant toi, la ligne en cours est en surbrillance, les paroles déjà
   chantées restent en grisé derrière toi. Arrivée à destination à la dernière note.

## Démo sans MP3

    node scripts/make-demo-wav.mjs   # génère samples/demo.wav (60 s)

Puis charge `samples/demo.wav` + `samples/chanson-automne.lrc` (Verlaine, domaine public).

## Tests

    npm test         # Vitest (parseurs, géométrie, timeline, clients HTTP mockés)
    npm run typecheck

Spec : `docs/superpowers/specs/2026-07-03-lyric-route-design.md`.
