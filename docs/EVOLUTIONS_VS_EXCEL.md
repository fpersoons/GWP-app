# Évolutions par rapport à l'outil Excel `GWP_Assessment_FR.xlsx`

## 1. Ce qui est conservé

| Élément | Excel (GHSC-FTA) | Application web |
|---|---|---|
| Domaines fonctionnels | 6 | 6 (mêmes intitulés, légèrement précisés) |
| Pondération par défaut | 15 / 15 / 15 / 25 / 5 / 25 | Identique, modifiable par évaluation et globalement |
| Approche par paliers | 0–35 / 36–70 / 71–100 % | Identique, affichée par domaine et globalement |
| Fiche d'identification | Centrale, personnes interviewées, évaluateurs, date, surfaces par zone, matériaux, risques adjacents | Identique et enrichie (niveau, programmes, SKU, effectif, capacité froid, hauteur → volume calculé) |
| Multi-entrepôts | 10 colonnes de bâtiments | Nombre illimité d'évaluations + écran de comparaison |
| Toutes les questions Excel | ~110 questions OUI/NON | Reprises, reformulées en critères vérifiables (aucune supprimée sauf doublons fusionnés) |

## 2. Ce qui change dans la notation

| Aspect | Excel | Application | Pourquoi |
|---|---|---|---|
| Échelle de réponse | OUI = 100 %, NON = 0 % | Conforme (1), Partiel (0,5), Non conforme (0), N/A | Refléter les situations intermédiaires fréquentes (SOP existe mais non appliquée…) |
| Non applicable | Inexistant : une centrale sans chaîne du froid ou sans chariots était pénalisée | 20 critères acceptent N/A et sont exclus du dénominateur | Évaluer équitablement des entrepôts de niveaux différents |
| Criticité | Toutes les questions pèsent pareil | Critique ×3, Majeur ×2, Mineur ×1 (logique PFSCM C/M/O) | Un extincteur périmé ou un stock non FEFO pèse plus qu'une imprimante manquante |
| Score de domaine | Moyenne simple des sections | Σ(criticité × note) / Σ(criticité) | Éviter qu'une petite section pèse autant qu'une grande |
| Priorité d'amélioration | poids ÷ score (division par zéro si score = 0) | poids × (1 − score) | Formule bornée, comparable entre domaines |
| Non-conformités critiques | Non signalées | Compteur et liste dédiée, quel que soit le score | Un score global correct peut masquer un risque majeur |
| Liste des SOP (Management) | 10 lignes OUI/NON | Critère « checklist » à 20 items, score = proportion | Vue d'ensemble et exhaustivité TRS 1025 |

## 3. Nouveaux critères (principales sources : OMS TRS 1025 Annexe 7, 2020)

| Thème | Critères ajoutés | Source |
|---|---|---|
| Contrôle de la température | Cartographie (mapping), calibration des instruments, limites d'alerte et gestion des excursions, maintenance HVAC | TRS 1025 §12.35–12.37, 18.40 ; TRS 961 Suppl. 7–8 ; PFSCM 5.2 |
| Réception | Contrôle documentaire complet, inspection physique et falsification, examen des données de transport, quarantaine jusqu'à libération, non-conformités à réception | TRS 1025 §12.10–12.17, 18.6–18.7 |
| Expédition / traçabilité | Commande valide, bordereau avec lots et péremptions, POD, véhicules | TRS 1025 §18.31–18.36 |
| Stock | Concordance physique/fiche (test sur 10 produits), aucun périmé en stock utilisable, investigation des écarts + CAPA, archivage | TRS 1025 §13.1–13.4 ; PFSCM 5.4 |
| Rappels et plaintes | Test annuel de la procédure de rappel, traçabilité aval par lot, rapport de rappel avec réconciliation, gestion des plaintes, produits falsifiés | TRS 1025 §8, §10, §20 |
| Système qualité | Politique qualité, responsable qualité désigné, auto-inspection, déviations/CAPA, gestion des risques, revue de direction, gestion documentaire, contrats des activités externalisées, inspections réglementaires | TRS 1025 §5–7, §11, §16.3, §17, §19, §21 |
| Sûreté / sécurité | Registre visiteurs, gestion des clés, détection incendie, exercices d'évacuation, kit déversement, premiers secours, code de conduite | TRS 1025 §12.3, 12.33, 16.14 ; JSI WAT H/I |
| Équipements | Habilitation des caristes, capacité des racks affichée, UPS, sauvegarde des données testée | TRS 1025 §14, §17.6 ; USAID Guidelines App. 2–3 |
| Opérations | Adressage des emplacements, flux unidirectionnel, capacité de stockage et besoins futurs, indicateurs opérationnels | USAID Guidelines §B, App. 4 ; JSI WAT |

## 4. Correspondance des questions Excel → critères

| Feuille Excel | Lignes | Critères de l'application |
|---|---|---|
| Infrastructure & Stockage §1 (risques adjacents) | 16 | I01 |
| Infrastructure & Stockage §2 (sol, murs, toit, portes, fenêtres, éclairage, panneau, thermomètres, nuisibles, électricité, génératrice, hygromètres, anomalies AQ) | 22–47 | I03–I08, I12–I16, I19–I21, I37, M19 |
| Infrastructure & Stockage §3 (sécurité et sûreté) | 51–61 | I25–I27, I30–I32, I34, I36, I38 |
| Infrastructure & Stockage §4 (exigences spéciales) | 65–76 | I24, I40–I46 |
| Matériels & Équipements §1 | 5–23 | E01–E04, E06–E17 |
| Matériels & Équipements §2 | 27–30 | E18, E19, E22 |
| Gestion des Stocks §1 | 21–28 | O01, O03–O08 |
| Gestion des Stocks §2 | 32–34 | O11, O12, O20 |
| Contrôle des stocks | 4–15 | S01, S02, S04, S05, S08–S12, S14, S15, S18 |
| Rappels, Rejets & Expirés | 4–11 | R01, R03, R04, R06 |
| Management | 5–27 | M01–M04, M08, M09, M12–M14, M22, M23, I11, I38 |

## 5. Modèle « centrale → entrepôts » (v2.0, 17/09/2026)

L'Excel évaluait chaque bâtiment (jusqu'à 10 colonnes) avec la totalité du questionnaire, management compris. Cas typique : CENAME (Cameroun) avec 13 magasins sous une même direction, un même système (SAGE) et les mêmes procédures. L'application distingue désormais :

| Portée | Nombre | Principe | Exemples |
|---|---|---|---|
| Organisation | 68 | Existence d'une politique, SOP, système, programme, organisation — répondu une fois pour la centrale, hérité par tous les entrepôts, détachable pour un bâtiment atypique | Organigramme, SOP, formation, CAPA, revue de direction, logiciel de stock, procédure de rappel, traçabilité, programme nuisibles, calibration, plan de contingence froid |
| Entrepôt | 86 | Constat physique ou application observée, y compris les utilités propres au site | Sol/murs/toit, température, extincteurs, génératrice, périmètre, zone inflammables, racks, empilage, étiquetage, quarantaine, FEFO vérifié, concordance fiche/physique, périmés en rayon |

Scores : **spécifique** (constats seuls, départage les bâtiments), **complet** (constats + organisation héritée, équivalent d'une évaluation Excel) et **consolidé** (chaque critère moyenné sur les entrepôts, pondéré par la surface de stockage). Les évaluations existantes deviennent des centrales à un entrepôt.

## 6. Pistes d'évolution possibles

- Pondération par défaut : la logique TRS 1025 justifierait de relever « Rappels, retours, rejets » (5 %) au profit d'une répartition 15/10/15/25/10/25. Le paramétrage est disponible dans l'application ; la valeur par défaut a été conservée pour la continuité avec les évaluations historiques.
- Synchronisation multi-appareils (serveur ou dossier partagé) si plusieurs évaluateurs travaillent en parallèle.
- Version anglaise (les libellés sont centralisés dans `criteria.js`).
