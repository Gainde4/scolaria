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
4. **Utilisateurs et rôles** : créez les comptes du personnel (secrétaire, enseignants, surveillant) avec un mot de passe provisoire : la personne devra le remplacer à sa première connexion. Les comptes des **parents et des élèves se créent tout seuls** : le parent s'inscrit en ligne, puis l'admission crée son compte parent et le compte élève.
5. **Inscription en ligne** : l'adresse `/exec` de l'application est aussi la page d'inscription ; les visiteurs non connectés y trouvent le bouton « Inscrire mon enfant ». Réglez-la dans **Modules > Personnaliser > Admissions** (ouverte ou fermée, validation par le secrétariat ou automatique, limite par heure, champs supplémentaires). Pour la fermer en période creuse, décochez « Inscription en ligne ouverte ».
6. **Autorisations** : la matrice (Administration > Autorisations) règle ce que chaque rôle peut voir, créer, modifier, supprimer. Les réglages d'origine conviennent à la plupart des écoles.
7. **Canaux de communication** (facultatif) : voir la section suivante.
8. Optionnel : pour recevoir chaque lundi à 7 h un rapport par e-mail, ouvrez l'éditeur Apps Script, sélectionnez la fonction `installWeeklyTrigger` et cliquez sur **Exécuter** une fois.

## Envoyer des e-mails, SMS et WhatsApp

Administration > **Canaux de communication**. Chaque canal se règle séparément ; chaque famille choisit dans son profil les canaux par lesquels l'école peut la joindre.

| Canal | Fournisseurs | Ce qu'il faut |
|---|---|---|
| E-mail | Gmail (compte qui a déployé l'application) | Rien : le script envoie depuis votre compte. Environ 100 messages par jour en compte gratuit |
| SMS | Lien manuel, Twilio, passerelle personnalisée | Twilio : Account SID, Auth Token et numéro (ou service de messagerie `MG…`) |
| WhatsApp | Lien manuel, Twilio, passerelle personnalisée | Twilio : mêmes clés ; numéro `whatsapp:+…` (bac à sable ou numéro approuvé) |

- **Lien manuel** : rien ne part tout seul. L'application prépare le message et un lien (`wa.me` ou `sms:`) que vous ouvrez depuis un téléphone. Gratuit.
- **Twilio** : envoi automatique, payant à l'usage. Pour WhatsApp, un message envoyé hors de la fenêtre de 24 h après le dernier message du parent doit utiliser un modèle approuvé par WhatsApp.
- **Passerelle personnalisée** : chaque message est envoyé en JSON `{ canal, to, nom, texte, event }` à une adresse **https** que vous contrôlez (opérateur local, Make, Zapier…). Un secret facultatif est transmis dans l'en-tête `X-Scolaria-Secret`.
- Les **clés d'accès** sont enregistrées dans les propriétés protégées du script, jamais dans le classeur, et ne sont plus affichées après saisie. Seule la direction peut les modifier.
- **Autorisation supplémentaire** : l'envoi par Twilio ou passerelle demande l'accès réseau (`script.external_request`) ; Google vous le demande la première fois. Si vous aviez déjà déployé une version précédente, copiez le nouveau `appsscript.json`, puis redéployez (Nouvelle version) et acceptez l'autorisation.
- Les messages automatiques (inscription reçue, admission, paiement, absence, rappel de mensualité) se règlent un par un : actif ou non, canaux, texte avec variables. Les envois groupés et les rappels se font depuis « Envoyer un message » et « Mensualités ».
- Le **journal des envois** garde la trace de chaque message (envoyé, à envoyer, échec et motif). Les mots de passe provisoires n'y figurent jamais. Par défaut, ils ne sont pas non plus envoyés par message.
- Chaque opération est limitée à 60 envois automatiques et 500 messages ; au-delà, choisissez une classe.

## Ce que chaque rôle voit (réglages d'origine, modifiables dans Autorisations)

| Rôle | Accès |
|---|---|
| Direction | Tout, y compris journal d'audit, paramètres, modules, autorisations et canaux |
| Secrétariat | Élèves, admissions, finances, équipements, stock, calendrier, messages |
| Surveillant général | Présences, conduite, activités, remplacements |
| Enseignant | Ses classes : notes, présences, cahier de textes, plan de cours |
| Parent | Uniquement ses enfants : résultats, présences, mensualités, rencontres |
| Élève | Uniquement son dossier : résultats, emploi du temps, avis |
| Famille candidate | Uniquement ses demandes d'inscription, les avis et le calendrier |

Ces droits sont appliqués **par le serveur** : un enseignant ne reçoit jamais les paiements, un parent ne reçoit jamais les données des autres familles. Les camarades d'un élève apparaissent sous forme anonyme, uniquement pour calculer le rang.

## Bon à savoir

- **Ne partagez pas le classeur Google Sheets** avec les utilisateurs : toutes les données passent par l'application. Seule la direction technique a besoin d'y accéder.
- **Sauvegardes** : Fichier > Historique des versions dans Google Sheets. Faites aussi une copie du classeur en fin de trimestre.
- **Inscription publique** : n'importe qui peut atteindre le formulaire. Les protections (champ piège, question, limite par heure, validation par le secrétariat) réduisent les abus mais ne les suppriment pas. Surveillez le module Admissions et le journal d'audit.
- **Mots de passe** : stockés sous forme hachée avec un sel propre à chaque compte, jamais en clair. Cinq échecs bloquent la connexion pendant 10 minutes. Ce niveau convient à une école ; il ne remplace pas une vraie base de données pour un très grand établissement.
- **Capacité** : confortable jusqu'à quelques milliers d'élèves. Au-delà, ou avec beaucoup d'utilisateurs simultanés, prévoyez une base de données classique.
- **Mise à jour du code** : après modification, *Déployer > Gérer les déploiements > Modifier > Nouvelle version*.
- **Documents** : le module enregistre le nom, la vérification et l'échéance de chaque pièce. Le dépôt du fichier lui-même vers Google Drive n'est pas inclus.
- **Impression** : reçus et convocations s'impriment avec le bouton « Imprimer » (réglez la mise en page du navigateur en A4).
