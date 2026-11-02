# Scolaria

Logiciel de gestion scolaire en français, conçu pour les écoles d'Afrique francophone : montants en FCFA, N° d'admission, notes sur 20 avec sept mentions, reçus avec le montant en lettres.

Il fonctionne de trois façons à partir du même code :

- **Démo dans le navigateur** : ouvrez `dist/index.html`. Une école fictive est chargée, les données restent dans le navigateur, et un sélecteur « Voir en tant que » permet de passer d'un rôle à l'autre.
- **Application réelle sur Google** : le classeur Google Sheets sert de base de données et Google Apps Script de serveur. Gratuit, sans hébergement. Voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).
- **Page sur Firebase Hosting** (facultatif) : la page est servie par Firebase (adresse courte, domaine personnalisé possible, en-têtes de sécurité stricts) ; les données et le serveur restent sur Apps Script. Gratuit, sans carte bancaire. Voir [docs/FIREBASE.md](docs/FIREBASE.md).

Ce projet reproduit les fonctions présentées dans la vidéo « School Management System with All Modules » (Mohammad Rameez Imdad). Le code est une réalisation originale : seule la liste des fonctions a servi de point de départ.

## Ce que fait l'application

| Domaine | Fonctions |
|---|---|
| Élèves et familles | Admissions (admettre un candidat crée l'élève et la fiche du parent), dossiers élèves, parents et liens, conduite et discipline, activités extrascolaires, documents avec vérification et alerte d'expiration, rencontres parents-professeurs avec réservation |
| Enseignement | Classes et sections, matières et coefficients, affectations, emploi du temps (grille, périodes, copie entre classes, détection des conflits d'enseignant), plan de cours, cahier de textes, remplacements |
| Évaluations | Appel par classe, examens, saisie groupée des notes, résultats avec moyennes pondérées, rang et mention, bulletins, convocations d'examen individuelles |
| Finances | Frais par classe, encaissement avec reçu numéroté, suivi des mensualités mois par mois, caisse du jour par mode de paiement (espèces, Wave, Orange Money, virement, chèque) |
| Communication | Avis par public, calendrier scolaire, plaintes anonymes, assistance avec délais de traitement (SLA), **envoi de messages par e-mail, SMS et WhatsApp** (messages automatiques, envois groupés, rappels de mensualité, journal des envois) |
| Patrimoine | Registre des équipements et maintenance, stock avec mouvements et alertes de réapprovisionnement |
| Pilotage | Tableau de bord avec graphiques et pastilles d'alerte, rapports de classe envoyés par e-mail, journal d'audit, paramètres de l'école, profil personnel |
| Administration | **Modules** (activer, renommer, ajouter des champs, modifier les listes de choix et les réglages), **Autorisations** (matrice rôle × module : voir, créer, modifier, supprimer), **Canaux de communication** (fournisseurs, clés d'accès, modèles de messages) |

## Inscription en ligne et comptes automatiques

Le formulaire d'inscription est **public** : un parent s'inscrit sans compte préalable. Il saisit ses coordonnées, choisit un mot de passe et déclare un ou plusieurs enfants ; son **espace famille** s'ouvre aussitôt (rôle « famille candidate »).

- Le secrétariat voit la candidature (référence `INS-AAAA-NNNN`) et clique sur « Admettre ». Cela crée la fiche élève, la fiche parent et les comptes : la famille candidate devient « parent » et reçoit l'accès aux données de son enfant, et un compte **élève** est créé (identifiant = n° d'admission, mot de passe provisoire à changer à la première connexion). Les mots de passe provisoires ne sont montrés qu'une fois.
- Réglages dans **Modules > Admissions** : formulaire ouvert ou fermé, validation par le secrétariat ou admission automatique, plafond d'inscriptions par heure, création des comptes, texte de consentement, champs supplémentaires.
- Protections : champ piège et question de vérification contre les robots, limite horaire, contrôle des dates et des numéros, neutralisation des formules dans le classeur, doublons refusés.
- On se connecte avec une adresse e-mail, un numéro de téléphone ou un n° d'admission.

## Rôles

Direction, secrétariat, surveillant général, enseignant, parent, élève et famille candidate. Chaque rôle ne voit que les modules que la **matrice d'autorisations** lui accorde (réglages d'origine modifiables par la direction, avec un plafond de sécurité par module : par exemple les paiements ne peuvent être confiés qu'au secrétariat et aucune famille ne peut modifier de données). En mode Google, **le serveur applique les droits** : un enseignant ne reçoit jamais les paiements, un parent ne reçoit que les données de ses enfants, et les camarades d'un élève sont anonymisés (ils ne servent qu'au calcul du rang).

## Structure du dépôt

```
src/schema.json      Schéma des 37 tables, partagé par l'interface et le serveur
src/shared/          Registre des modules, droits et règles métier (inscription, admission, messages) : le même code tourne dans l'interface et dans Code.gs
src/js/00-core.js    Utilitaires, montants en lettres, calcul des mensualités, données de démonstration, accès aux données
src/js/10-ui.js      Composants : icônes, formulaires, boîtes de dialogue, graphiques
src/js/20-crud.js    Moteur de pages liste/formulaire et configuration des modules
src/js/30-special.js Pages spécialisées : tableau de bord, notes, présences, emploi du temps, reçus, rapports
src/js/35-admin.js   Administration : modules, autorisations, canaux, messages, journal des envois
src/js/38-public.js  Inscription en ligne sans connexion, changement du mot de passe provisoire
src/js/40-app.js     Application : navigation construite depuis le registre, droits, connexion, état global
src/style.css        Styles (thèmes clair et sombre, adaptation mobile, impression)
backend/Code.gs      Serveur Google Apps Script : authentification, droits, accès au classeur
build.py             Assemble tout dans dist/
dist/index.html      Page autonome (React chargé depuis un CDN)
dist/gas/            Dossier prêt à coller dans Apps Script
dist/firebase/       Projet Firebase Hosting prêt à publier (page, config.js, firebase.json) ; src/firebase/ contient les modèles
tests/               Tests du serveur et de l'interface ; gas-sim.js et gas-server.js exécutent le vrai Code.gs sur des services Google simulés
```

L'interface est écrite en React sans étape de compilation (templates `htm`). Le fichier `build.py` concatène les sources, injecte le schéma et produit les fichiers de `dist/`.

## Construire

```bash
python3 build.py
```

Le résultat est dans `dist/`. Ouvrez `dist/index.html` pour la démo, collez le contenu de `dist/gas/` dans Apps Script pour le déploiement réel, ou publiez `dist/firebase/` avec `firebase deploy --only hosting` (voir [docs/FIREBASE.md](docs/FIREBASE.md)). La version Firebase est construite seulement si `vendor/` existe (`npm install && npm run vendor`) ; elle est déjà fournie dans le dépôt.

## Tester

Prérequis : Node 18 ou plus, Python 3 avec [Playwright](https://playwright.dev/python/) et un Chromium.

```bash
npm install
npm test
```

Si Chromium est déjà installé ailleurs, indiquez son chemin : `CHROMIUM_PATH=/chemin/vers/chromium npm test`.

| Test | Ce qu'il vérifie |
|---|---|
| `tests/backend.test.js` | `Code.gs` (y compris la porte d'entrée HTTP `doPost` et sa liste blanche de fonctions) face à une simulation de l'API Google (classeur, cache, courrier, réseau Twilio et passerelle) : connexion et blocage, filtrage des données par rôle, matrice d'autorisations, inscription publique, admission et comptes automatiques, champs personnalisés, canaux et clés d'API, quotas, performances |
| `tests/ui_smoke.py` | Tous les écrans s'affichent pour chacun des 7 rôles, sans erreur JavaScript |
| `tests/ui_flows.py` | Parcours métier : encaissement et reçu, appel, notes, admission, inscription en ligne, personnalisation des modules, matrice, canaux, envois |
| `tests/ui_gas.py` | Connexion, création du premier compte, inscription publique sans connexion, changement du mot de passe provisoire, avec une fausse API `google.script.run` |
| `tests/ui_firebase.py` | Page Firebase de bout en bout : servie avec les vrais en-têtes de sécurité de `firebase.json`, elle appelle le vrai `Code.gs` par HTTP (création du compte, import, connexion, inscription publique, un script injecté est bloqué, erreurs de configuration et de réseau) |

## Limites connues

- Google Sheets convient à une petite ou moyenne école. Pour plusieurs centaines d'élèves avec beaucoup d'utilisateurs simultanés, une vraie base de données est préférable.
- Le module Documents enregistre le nom, la vérification et l'échéance des pièces, pas le fichier lui-même.
- Le serveur a été testé avec une simulation de l'API Google, **pas sur un déploiement Apps Script réel**. C'est vrai en particulier pour les envois Twilio et par passerelle (l'appel réseau est simulé) : faites un essai depuis « Canaux de communication > Envoyer un essai » avant de compter dessus.
- **WhatsApp** : un message envoyé automatiquement à un parent qui n'a pas écrit à l'école depuis 24 h doit utiliser un modèle approuvé par WhatsApp, sinon Twilio refuse l'envoi. Le mode « lien » (gratuit, manuel) n'a pas cette contrainte.
- **E-mail** : un compte Gmail gratuit envoie environ 100 messages par jour (1 500 avec Google Workspace). Le quota restant s'affiche dans « Canaux de communication ».
- **SMS** : aucun opérateur local n'est branché en direct (l'API Orange n'a pas pu être vérifiée). Utilisez Twilio, le mode « lien » ou la passerelle personnalisée (un petit service https qui reçoit chaque message en JSON).
- L'admission automatique permet à n'importe qui d'occuper des places et de créer des comptes sans contrôle humain : à réserver à un établissement qui surveille son journal d'audit.
- Aucune licence n'est définie pour l'instant.
