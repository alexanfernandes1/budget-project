# Budget — Application de suivi budgétaire personnel

Application web autonome (un seul fichier HTML) pour suivre ses comptes mois par mois, remplaçant un fichier Excel manuel. Fonctionne hors ligne, se synchronise avec OneDrive, et s'installe comme une app sur iPhone.

## Fonctionnalités

- **Suivi du mois** : tableau des dépenses et recettes, avec case « traité » (débité en banque ou non), catégories et compte de paiement. Barre de KPI collante en haut (En cours, Prévisionnel, Épargne) qui se met à jour en direct à chaque saisie.
- **Tableau de bord** : balance, revenu, en cours, prévisionnel, livrets d'épargne, graphiques traité vs. à venir, répartition des dépenses.
- **Analyses** : évolution du solde sur 12 mois, revenus vs dépenses, répartition par catégorie (à partir d'août 2026).
- **Épargne** : évolution du Livret A et du Livret A des enfants.
- **Dépenses/recettes récurrentes** : les lignes fixes (salaire, loyer, abonnements…) sont reprises automatiquement à la création du mois suivant.
- **Mode clair / sombre** : bouton discret, clair par défaut.
- **Responsive** : tableau en colonnes sur PC, cartes compactes sur iPhone.

## Comment ça marche

### Stockage des données
- Les saisies sont enregistrées automatiquement dans le navigateur (`localStorage`).
- L'historique importé depuis Excel est intégré directement dans le fichier HTML.
- Un bouton Export/Import JSON permet de sauvegarder ou restaurer manuellement.

### Synchronisation OneDrive (optionnelle)
L'app peut se synchroniser avec un compte Microsoft personnel via MSAL.js et l'API Microsoft Graph :
- Les données sont écrites dans un dossier dédié à l'app sur OneDrive (`Files.ReadWrite.AppFolder`).
- Synchronisation automatique à chaque modification, avec repli hors ligne.
- Stratégie « le plus récent gagne » (usage solo, un appareil à la fois).

Un indicateur en haut montre l'état : gris (déconnecté), orange (en cours), vert (synchronisé), rouge (erreur/hors ligne).

## Convention des montants (héritée d'Excel)

- Seule la catégorie **Salaire** donne un montant positif (recette).
- Toutes les autres lignes sont des **dépenses** par défaut.
- Un montant **négatif** inverse la nature : c'est un crédit/remboursement.
- Les lignes catégorisées **Épargne** avec un montant négatif sont des **régularisations** (transfert Livret A → compte courant) et sont comptées à part, pas comme un revenu.

### Calcul des soldes
- **En cours** = balance du mois précédent + recettes/régularisations traitées − dépenses traitées.
- **Prévisionnel** = En cours + tout ce qui reste « à venir » (non traité).

## Déploiement

### Hébergement (GitHub Pages, gratuit)
1. Créer un dépôt public, y déposer le fichier HTML renommé `index.html`.
2. Déposer aussi l'icône `apple-touch-icon.png` à la racine.
3. Activer GitHub Pages dans **Settings → Pages** (branche `main`, dossier racine).
4. L'app est accessible à `https://<pseudo>.github.io/<depot>/`.

### Configuration OneDrive (Entra ID)
1. Créer une inscription d'application sur [entra.microsoft.com](https://entra.microsoft.com) (nécessite un répertoire — créer un compte Azure gratuit si besoin).
2. Type de compte : **Comptes Microsoft personnels uniquement**.
3. URI de redirection **SPA** = l'URL GitHub Pages.
4. Autorisation API déléguée : `Files.ReadWrite.AppFolder`.
5. Reporter l'**ID d'application (client)** dans `MSAL_CONFIG.auth.clientId` du code.

Plusieurs URL de redirection peuvent partager la même inscription : chaque utilisateur se connecte avec son propre compte Microsoft et accède uniquement à son espace.

### Installation sur iPhone
Ouvrir l'URL dans **Safari** → bouton Partager → **Sur l'écran d'accueil**. L'app s'ouvre en plein écran avec son icône dédiée.

## Structure technique

- **Zéro dépendance externe** hormis MSAL.js, embarqué directement dans le fichier (aucun CDN requis, fonctionne hors ligne).
- HTML/CSS/JavaScript natif, graphiques dessinés sur `<canvas>` sans librairie.
- Un seul fichier `.html` autonome et portable.

## Sauvegarde et confidentialité

- Exportez régulièrement une sauvegarde JSON.
- **Attention** : un dépôt GitHub Pages gratuit est public — le fichier HTML contient l'historique budgétaire en clair. Pour un usage privé, envisager un dépôt privé (GitHub Pro) ou un hébergement avec authentification.
