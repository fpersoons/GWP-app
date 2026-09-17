# GWP — Évaluation des Bonnes Pratiques d'Entreposage

Application web (tablette, hors ligne) pour évaluer la conformité des entrepôts de produits de santé aux Bonnes Pratiques de Stockage et de Distribution (OMS TRS 1025, Annexe 7, 2020) et prioriser les améliorations.

Elle succède à l'outil Excel `GWP-TOOLS/GWP_Assessment_FR.xlsx` (GHSC-FTA) : mêmes six domaines fonctionnels et même logique de pondération, avec un référentiel enrichi (154 critères), une notation par criticité et un rapport automatique. Voir [docs/EVOLUTIONS_VS_EXCEL.md](docs/EVOLUTIONS_VS_EXCEL.md) et [docs/REFERENTIEL.md](docs/REFERENTIEL.md).

## Fonctionnalités

- **Six domaines** : Infrastructure & conditions de stockage · Matériels & équipements · Gestion du stockage & opérations · Contrôle des stocks · Rappels, retours, rejets & périmés · Management & système qualité.
- **Notation** : Conforme / Partiel / Non conforme / N/A, pondérée par criticité (Critique ×3, Majeur ×2, Mineur ×1). Poids des domaines modifiables. Score global, paliers (0–35 / 36–70 / 71–100 %), priorité d'amélioration = poids × (1 − score).
- **Aide contextuelle** sur chaque critère : comment vérifier, référence normative, recommandation.
- **Observations et photos** (appareil photo de la tablette) par critère.
- **Sauvegarde automatique locale** (fonctionne sans connexion, installable comme application — PWA).
- **Synthèse** : radar, tableau par domaine et section, liste des non-conformités classées par criticité, plan d'action.
- **Comparaison** de plusieurs entrepôts.
- **Exports** : JSON (sauvegarde/partage, réimportable), CSV (Excel), rapport imprimable / PDF.

## Lancer l'application

Aucune installation ni compilation. Servir le dossier `app/` par HTTP :

```bash
python3 -m http.server 8765 --directory app
```

puis ouvrir <http://localhost:8765>. Sur tablette, ouvrir l'URL du serveur (même réseau Wi-Fi) puis « Ajouter à l'écran d'accueil » pour l'installer ; elle fonctionne ensuite hors ligne.

Pour un déploiement, copier `app/` sur n'importe quel hébergement statique (GitHub Pages, Netlify, serveur interne). HTTPS est requis pour le mode hors ligne et l'accès à l'appareil photo.

## Structure

```
app/
  index.html            page unique
  css/app.css           styles (tactile, impression)
  js/app.js             vues et navigation
  js/scoring.js         moteur de notation
  js/store.js           persistance (localStorage + IndexedDB pour les photos)
  js/export.js          export JSON / CSV, import
  data/criteria.js      RÉFÉRENTIEL (domaines, sections, critères, criticité, sources)
  sw.js, manifest.webmanifest, icons/   PWA
docs/
  REFERENTIEL.md        référentiel généré depuis criteria.js
  EVOLUTIONS_VS_EXCEL.md  correspondance et évolutions par rapport à l'outil Excel
GWP-TOOLS/              outil Excel d'origine, tutoriel, ressources graphiques
RESSOURCES/             documents de référence (OMS, USAID, PFSCM, NSCA…)
```

## Modifier le référentiel

Tout est dans `app/data/criteria.js` : ajouter/retirer un critère, changer sa criticité (`crit: 'C' | 'M' | 'm'`), autoriser N/A (`na: true`), modifier les textes d'aide. Régénérer `docs/REFERENTIEL.md` :

```bash
node -e "import('./app/data/criteria.js').then(m=>{ /* voir docs */ })"
```

Les évaluations déjà enregistrées conservent leurs réponses par identifiant de critère (`I01`, `S14`…) ; ne pas réutiliser un identifiant pour un critère différent.

## Sources

- OMS, *Good storage and distribution practices for medical products*, TRS 1025, Annexe 7, 2020.
- OMS, *Model guidance for the storage and transport of time- and temperature-sensitive pharmaceutical products*, TRS 961, Annexe 9, 2011 et suppléments techniques.
- USAID | DELIVER PROJECT, *Guidelines for Warehousing Health Commodities*, 2014.
- USAID | DELIVER PROJECT, *Warehouse Assessment Tool Questionnaire* (Nigeria TB Warehousing Assessment, 2009).
- PFSCM, *Pharmaceutical Wholesaler Site Inspection Checklist*.
- GHSC-FTA, *Outil d'analyse de la conformité aux bonnes pratiques d'entreposage* (Excel).
- GHSC-PSM, *National Supply Chain Assessment 2.0* (module Entreposage & Stockage).
