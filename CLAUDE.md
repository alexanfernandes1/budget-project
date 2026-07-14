# CLAUDE.md — Guide du projet Budget

Contexte pour Claude Code lorsqu'il travaille sur ce dépôt.

## Vue d'ensemble

Application web de suivi budgétaire personnel, **entièrement autonome** (un seul fichier HTML une fois construit). Deux profils : Alex et Charlotte, qui partagent le même code mais ont des données et une identité visuelle distinctes. Déployée sur GitHub Pages, synchronisée avec OneDrive via MSAL.js.

## Règle d'or : ne JAMAIS éditer le fichier construit

Le fichier déployé (`dist/index_*.html`, ~1 Mo) est **généré** — il concatène les données, la bibliothèque MSAL et le code. **Toujours modifier les sources**, puis reconstruire :

```
node scripts/build.js            # construit les deux profils
node scripts/build.js alex       # un seul profil
```

Les fichiers `dist/*.html` ne doivent pas être édités à la main ni versionnés comme source de vérité.

## Structure

```
src/
  app_shell.html        Structure HTML + CSS + placeholders (__MSAL_JS__, __SEED_DATA__, __APP_JS__)
  app.js                Toute la logique applicative (rendu, calculs, sync OneDrive, graphiques)
  msal-browser.min.js   Bibliothèque Microsoft MSAL v3 (embarquée, ne pas modifier)
data/
  budget_data_alex.json       Historique importé depuis l'Excel d'Alex
  budget_data_charlotte.json  Idem pour Charlotte
assets/
  apple-touch-icon-*.png      Icônes d'app iPhone
scripts/
  build.js              Assemble le HTML final depuis les sources
  extract.py            Régénère les JSON de données depuis un fichier Excel
dist/                   Sortie de build (à déposer sur GitHub Pages, non éditée à la main)
```

## Conventions métier (importantes pour ne pas casser les calculs)

- Seule la catégorie **Salaire** est une recette (montant positif).
- Les autres lignes sont des dépenses ; un montant **négatif** = crédit/remboursement.
- Les lignes de catégorie **Épargne** avec montant négatif = **régularisations** (transfert Livret A → compte courant), comptées à part, pas comme un revenu.
- **En cours** = balance mois précédent + recettes/régul traitées − dépenses traitées. Le champ `revenu` n'est PAS ajouté séparément (le salaire est déjà une ligne).
- **Prévisionnel** = En cours + lignes non traitées.
- Les graphiques par catégorie ne s'affichent qu'à partir de `CATEGORY_START_KEY` (2026-08).

## Points d'attention techniques

- **Pas de dépendance externe au runtime** : MSAL est embarqué, les graphiques sont dessinés sur `<canvas>` sans librairie. Ne pas réintroduire de `<script src="cdn...">`.
- **Stockage** : `localStorage` pour les saisies, plus synchro OneDrive optionnelle (dossier applicatif `Files.ReadWrite.AppFolder`).
- **Client ID Entra** : dans `app.js`, `MSAL_CONFIG.auth.clientId`. Une seule inscription Entra sert les deux profils ; chaque URL de déploiement doit être ajoutée comme URI de redirection SPA dans le portail Entra.
- **Couleurs des graphiques** : lues dynamiquement depuis les variables CSS via `chartColors()` pour rester cohérentes en thème clair/sombre.
- **Responsive** : sous 640px le tableau passe en cartes compactes (voir la media query dans `app_shell.html`).

## Régénérer les données depuis Excel

Si l'un des fichiers Excel évolue :

```
python3 scripts/extract.py   # adapter le chemin d'entrée/sortie dans le script
```

Le script lit chaque onglet mensuel (nommé « Budget <Mois> <Année> »), en extrait l'encart de synthèse et le tableau de suivi, et produit un JSON `{ "AAAA-MM": { summary, items } }`.

## Déploiement

1. `node scripts/build.js`
2. Déposer `dist/index_<profil>.html` renommé `index.html` sur le dépôt GitHub Pages correspondant.
3. Déposer l'icône `apple-touch-icon.png` correspondante à la racine.
4. Vérifier que l'URL du site figure dans les URI de redirection SPA de l'inscription Entra.

## Tests rapides

Il n'y a pas de suite de tests formelle. Pour valider une modification, on charge le HTML construit dans un navigateur (ou via jsdom) et on vérifie : rendu des 4 onglets, ajout/édition/suppression d'une ligne, mise à jour des KPI, navigation entre mois, bascule de thème.
