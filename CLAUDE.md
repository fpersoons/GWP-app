# GWP-app — instructions projet

@../design-system/DESIGN_SYSTEM.md

Preset couleurs : **CHEMONICS**

## Contexte

Application d'évaluation des Bonnes Pratiques d'Entreposage (OMS TRS 1025) pour le projet GHSC-PSM / Chemonics. Voir [README.md](README.md) pour les fonctionnalités, le lancement local et le déploiement (GitHub Pages via Actions à chaque push sur `main`).

## Adaptation du design system à cette stack

- L'app est en **HTML / CSS / JS pur** (PWA hors ligne, dossier `app/`), sans React ni Tailwind. Appliquer les règles du design system (palette Chemonics §3–4, typographie §5, icônes SVG §6, layout §7, composants §8, accessibilité §10, anti-patterns §12) en **CSS classique** : déclarer les couleurs `chem-*` comme variables `--chem-*` dans `app/css/`, reproduire les classes utilitaires citées par leurs équivalents CSS.
- Police : Montserrat (Google Fonts) avec repli `system-ui` — l'app doit rester utilisable hors ligne, donc conserver le repli si la police n'est pas en cache.
- Cible principale : **tablette tactile** → garder les cibles ≥ 28 px (`pointer: coarse`) et une densité un cran moins serrée que le budget (corps 11–12 px, `p-3` par défaut).
- Icônes : SVG inline au trait (style Lucide, `stroke-width 2.5`), jamais d'emoji ni de police d'icônes.
