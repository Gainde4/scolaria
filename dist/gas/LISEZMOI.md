# Scolaria sur Google Apps Script + Google Sheets

Gestion scolaire complète : la base de données est un classeur Google Sheets, l'application est une page web servie gratuitement par Apps Script. Aucun hébergement à payer.

## Installation (10 minutes)

1. Créez un **Google Sheets vide** (sheets.new). Donnez-lui un nom, par exemple « Scolaria – base de données ».
2. Menu **Extensions > Apps Script**. Un éditeur s'ouvre.
3. Remplacez tout le contenu du fichier `Code.gs` par celui de ce dossier.
4. Cliquez sur **+** (Fichiers) > **HTML**, nommez-le exactement `Index` (sans `.html`) et collez le contenu de `Index.html`.
5. Roue dentée **Paramètres du projet** > cochez **Afficher le fichier manifeste « appsscript.json »**. Revenez à l'éditeur, ouvrez `appsscript.json` et remplacez son contenu par celui de ce dossier.
6. **Déployer > Nouveau déploiement > Application Web**
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde** (l'application a sa propre connexion par mot de passe)
7. Autorisez l'accès à votre compte Google quand on vous le demande, puis ouvrez l'adresse qui se termine par `/exec`.

## Premier démarrage

1. L'écran « Créer le compte de la direction » apparaît. Saisissez votre nom, votre adresse e-mail et un mot de passe (8 caractères minimum).
2. Dans **Paramètres**, renseignez le nom de l'école, l'année scolaire et le directeur.
3. Si vous voulez essayer avant de saisir vos vraies données, le même écran propose **Charger les données d'exemple** (une école fictive de 5 classes). Disponible uniquement tant que la base est vide.
4. **Utilisateurs et rôles** : créez les comptes (secrétaire, enseignants, surveillant, parents, élèves), reliez chaque enseignant, élève ou parent à sa fiche, puis utilisez « Mot de passe » pour leur en donner un. Chacun peut ensuite le changer dans « Mon profil ».
5. Optionnel : pour recevoir chaque lundi à 7 h un rapport par e-mail, ouvrez l'éditeur Apps Script, sélectionnez la fonction `installWeeklyTrigger` et cliquez sur **Exécuter** une fois.

## Ce que chaque rôle voit

| Rôle | Accès |
|---|---|
| Direction | Tout, y compris journal d'audit, paramètres et utilisateurs |
| Secrétariat | Élèves, admissions, finances, équipements, stock, calendrier |
| Surveillant général | Présences, conduite, activités, remplacements |
| Enseignant | Ses classes : notes, présences, cahier de textes, plan de cours |
| Parent | Uniquement ses enfants : résultats, présences, mensualités, rencontres |
| Élève | Uniquement son dossier : résultats, emploi du temps, avis |

Ces droits sont appliqués **par le serveur** : un enseignant ne reçoit jamais les paiements, un parent ne reçoit jamais les données des autres familles. Les camarades d'un élève apparaissent sous forme anonyme, uniquement pour calculer le rang.

## Bon à savoir

- **Ne partagez pas le classeur Google Sheets** avec les utilisateurs : toutes les données passent par l'application. Seule la direction technique a besoin d'y accéder.
- **Sauvegardes** : Fichier > Historique des versions dans Google Sheets. Faites aussi une copie du classeur en fin de trimestre.
- **Mots de passe** : stockés sous forme hachée avec un sel propre à chaque compte, jamais en clair. Cinq échecs bloquent la connexion pendant 10 minutes. Ce niveau convient à une école ; il ne remplace pas une vraie base de données pour un très grand établissement.
- **Capacité** : confortable jusqu'à quelques milliers d'élèves. Au-delà, ou avec beaucoup d'utilisateurs simultanés, prévoyez une base de données classique.
- **Mise à jour du code** : après modification, *Déployer > Gérer les déploiements > Modifier > Nouvelle version*.
- **Documents** : le module enregistre le nom, la vérification et l'échéance de chaque pièce. Le dépôt du fichier lui-même vers Google Drive n'est pas inclus.
- **Impression** : reçus et convocations s'impriment avec le bouton « Imprimer » (réglez la mise en page du navigateur en A4).
