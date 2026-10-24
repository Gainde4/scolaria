# Scolaria

Logiciel de gestion scolaire en français, conçu pour les écoles d'Afrique francophone : montants en FCFA, N° d'admission, notes sur 20 avec sept mentions, reçus avec le montant en lettres.

Il fonctionne de deux façons à partir du même code :

- **Démo dans le navigateur** : ouvrez `dist/index.html`. Une école fictive est chargée, les données restent dans le navigateur, et un sélecteur « Voir en tant que » permet de passer d'un rôle à l'autre.
- **Application réelle sur Google** : le classeur Google Sheets sert de base de données et Google Apps Script de serveur. Gratuit, sans hébergement. Voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

Ce projet reproduit les fonctions présentées dans la vidéo « School Management System with All Modules » (Mohammad Rameez Imdad). Le code est une réalisation originale : seule la liste des fonctions a servi de point de départ.

## Ce que fait l'application

| Domaine | Fonctions |
|---|---|
| Élèves et familles | Admissions (admettre un candidat crée l'élève et la fiche du parent), dossiers élèves, parents et liens, conduite et discipline, activités extrascolaires, documents avec vérification et alerte d'expiration, rencontres parents-professeurs avec réservation |
| Enseignement | Classes et sections, matières et coefficients, affectations, emploi du temps (grille, périodes, copie entre classes, détection des conflits d'enseignant), plan de cours, cahier de textes, remplacements |
| Évaluations | Appel par classe, examens, saisie groupée des notes, résultats avec moyennes pondérées, rang et mention, bulletins, convocations d'examen individuelles |
| Finances | Frais par classe, encaissement avec reçu numéroté, suivi des mensualités mois par mois, caisse du jour par mode de paiement (espèces, Wave, Orange Money, virement, chèque) |
| Communication | Avis par public, calendrier scolaire, plaintes anonymes, assistance avec délais de traitement (SLA) |
| Patrimoine | Registre des équipements et maintenance, stock avec mouvements et alertes de réapprovisionnement |
| Pilotage | Tableau de bord avec graphiques et pastilles d'alerte, rapports de classe envoyés par e-mail, journal d'audit, paramètres de l'école, profil personnel |

## Rôles

Direction, secrétariat, surveillant général, enseignant, parent, élève. Chaque rôle ne voit que ses modules. En mode Google, **le serveur applique les droits** : un enseignant ne reçoit jamais les paiements, un parent ne reçoit que les données de ses enfants, et les camarades d'un élève sont anonymisés (ils ne servent qu'au calcul du rang).

## Structure du dépôt

```
src/schema.json      Schéma des 32 tables, partagé par l'interface et le serveur
src/js/00-core.js    Utilitaires, montants en lettres, calcul des mensualités, données de démonstration, accès aux données
src/js/10-ui.js      Composants : icônes, formulaires, boîtes de dialogue, graphiques
src/js/20-crud.js    Moteur de pages liste/formulaire et configuration des modules
src/js/30-special.js Pages spécialisées : tableau de bord, notes, présences, emploi du temps, reçus, rapports
src/js/40-app.js     Application : navigation, droits, connexion, état global
src/style.css        Styles (thèmes clair et sombre, adaptation mobile, impression)
backend/Code.gs      Serveur Google Apps Script : authentification, droits, accès au classeur
build.py             Assemble tout dans dist/
dist/index.html      Page autonome (React chargé depuis un CDN)
dist/gas/            Dossier prêt à coller dans Apps Script
tests/               Tests du serveur et de l'interface
```

L'interface est écrite en React sans étape de compilation (templates `htm`). Le fichier `build.py` concatène les sources, injecte le schéma et produit les fichiers de `dist/`.

## Construire

```bash
python3 build.py
```

Le résultat est dans `dist/`. Ouvrez `dist/index.html` pour la démo, ou collez le contenu de `dist/gas/` dans Apps Script pour le déploiement réel.

## Tester

Prérequis : Node 18 ou plus, Python 3 avec [Playwright](https://playwright.dev/python/) et un Chromium.

```bash
npm install
npm test
```

Si Chromium est déjà installé ailleurs, indiquez son chemin : `CHROMIUM_PATH=/chemin/vers/chromium npm test`.

| Test | Ce qu'il vérifie |
|---|---|
| `tests/backend.test.js` | `Code.gs` face à une simulation de l'API Google : création du compte, connexion, blocage après 5 échecs, filtrage des données par rôle, droits d'écriture, mots de passe hachés |
| `tests/ui_smoke.py` | Les 38 écrans s'affichent pour chacun des 6 rôles, sans erreur JavaScript |
| `tests/ui_flows.py` | Parcours métier : encaissement et reçu, appel, notes, admission, validations, stock, cloisonnement des rôles |
| `tests/ui_gas.py` | Connexion, création du premier compte, session et déconnexion avec une fausse API `google.script.run` |

## Limites connues

- Google Sheets convient à une petite ou moyenne école. Pour plusieurs centaines d'élèves avec beaucoup d'utilisateurs simultanés, une vraie base de données est préférable.
- Le module Documents enregistre le nom, la vérification et l'échéance des pièces, pas le fichier lui-même.
- Le serveur a été testé avec une simulation de l'API Google, pas encore sur un déploiement Apps Script réel.
- Aucune licence n'est définie pour l'instant.
