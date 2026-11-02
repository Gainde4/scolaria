# Déployer Scolaria sur Firebase Hosting

Firebase Hosting **sert la page** de l'application (adresse du type `https://votre-ecole.web.app`). Les **données et la logique** restent sur Google Apps Script et Google Sheets, comme dans [DEPLOIEMENT.md](DEPLOIEMENT.md).

```
Navigateur ──► Firebase Hosting (la page, gratuit, sans carte bancaire)
     │
     └──────► Google Apps Script (le serveur) ──► Google Sheets (les données)
```

Ce que cela apporte : une adresse courte et propre à communiquer aux familles, un domaine personnalisé possible (`inscription.monecole.sn`), un chargement rapide de la page et des en-têtes de sécurité stricts. Ce que cela **ne change pas** : les limites d'Apps Script (quotas d'e-mails et d'appels, quelques secondes d'attente à la première action après une période d'inactivité) s'appliquent toujours. Un passage complet à Firebase (Cloud Functions + Firestore) demanderait le plan payant Blaze (carte bancaire) et une réécriture du serveur : c'est un autre projet.

La page pèse environ 140 Ko une fois compressée : le plan gratuit (360 Mo de transfert par jour) couvre plus de 2 000 premières visites par jour, les visites suivantes utilisant le cache du navigateur.

Compter 20 à 30 minutes.

## Avant de commencer

1. Le serveur Apps Script doit être déployé comme dans [DEPLOIEMENT.md](DEPLOIEMENT.md), avec l'accès **« Tout le monde »**.
2. **Mettez-le à jour** avec le `Code.gs` de ce dépôt (dossier `dist/gas/`) : il contient la nouvelle porte d'entrée `doPost`, nécessaire à Firebase. Dans l'éditeur Apps Script, remplacez tout le contenu de `Code.gs`, enregistrez, puis **Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer**. L'adresse ne change pas. Sans cette nouvelle version, le serveur continue de répondre avec l'ancien code.
3. Copiez l'adresse « Application Web » qui se termine par `/exec`.
4. Vérifiez-la : ouvrez cette adresse suivie de `?ping=1` dans un navigateur. Vous devez voir `{"ok":true,"app":"Scolaria"}`.

## Étapes

### 1. Créer le projet Firebase

Allez sur <https://console.firebase.google.com>, **Ajouter un projet**, donnez un nom (par exemple « Scolaria École X »). Google Analytics est inutile : refusez-le. Notez l'**identifiant du projet** affiché (par exemple `scolaria-ecole-x-4821`).

Le plan gratuit « Spark » suffit : aucune carte bancaire n'est demandée pour l'hébergement.

### 2. Préparer un poste de travail

Deux possibilités :

- **Sans rien installer** : ouvrez <https://shell.cloud.google.com> (Cloud Shell, gratuit, dans le navigateur). Si la commande `firebase` n'est pas reconnue plus loin, lancez `npm install -g firebase-tools`.
- **Sur votre ordinateur** : installez [Node.js](https://nodejs.org) (version LTS), puis `npm install -g firebase-tools`.

### 3. Récupérer le projet

```bash
git clone https://github.com/Gainde4/scolaria.git
cd scolaria/dist/firebase
```

### 4. Vous connecter à Firebase

```bash
firebase login            # dans Cloud Shell : firebase login --no-localhost
```

### 5. Renseigner deux fichiers

1. **L'identifiant du projet** : `firebase use --add`, choisissez votre projet, donnez-lui l'alias `default`. (Ou modifiez `.firebaserc` à la main.)
2. **L'adresse du serveur** : ouvrez `public/config.js` et remplacez le texte par votre adresse `/exec` :

```js
window.SCOLARIA_API = 'https://script.google.com/macros/s/AKfycb.../exec';
```

Seules les adresses `https://script.google.com/…/exec` sont acceptées. Les comptes Google Workspace ont une adresse de la forme `https://script.google.com/a/macros/votre-domaine/s/…/exec` : elle convient aussi.

### 6. Publier

```bash
firebase deploy --only hosting
```

Firebase affiche l'adresse publique : `https://<identifiant>.web.app`. Ouvrez-la. Au tout premier lancement, l'application propose de **créer le compte de la direction**. S'il existe déjà, l'écran de connexion apparaît, avec le bouton « Inscrire mon enfant » pour les familles.

### 7. Adresse personnalisée (facultatif)

Console Firebase → **Hosting → Ajouter un domaine personnalisé**. Le certificat HTTPS est gratuit et automatique. L'achat du nom de domaine reste à votre charge. Aucun réglage supplémentaire dans Scolaria.

## Mettre à jour plus tard

- **La page** : récupérez la dernière version (`git pull`), conservez votre `public/config.js`, puis `firebase deploy --only hosting`.
- **Le serveur** : collez le nouveau `Code.gs`, puis créez une **nouvelle version** du déploiement (étape 2 de « Avant de commencer »). Oublier ce point est la cause la plus fréquente de « mes changements n'apparaissent pas ».

## Si quelque chose ne marche pas

Appuyez sur **F12** dans le navigateur et regardez l'onglet **Console** : les erreurs de sécurité ou de réseau s'y affichent en clair.

| Message affiché | Cause probable | Que faire |
|---|---|---|
| « Adresse du serveur non configurée » | `config.js` contient encore le texte d'exemple, ou une adresse qui n'est pas `https://script.google.com/…/exec` | Corrigez `public/config.js`, relancez `firebase deploy --only hosting` |
| « Serveur injoignable » | Pas d'Internet, adresse fausse, ou l'adresse a changé après un nouveau déploiement (au lieu d'une nouvelle *version*) | Testez `…/exec?ping=1` ; vérifiez l'adresse dans `config.js` |
| « Réponse inattendue du serveur » | Accès Apps Script restreint, ancien `Code.gs` sans `doPost`, ou quota Google dépassé | Accès **Tout le monde** ; collez le nouveau `Code.gs` et créez une nouvelle version ; réessayez plus tard si le quota est atteint |
| Page blanche | Erreur de chargement d'un fichier | Console (F12) ; relancez le déploiement depuis `dist/firebase` |
| Erreur « blocked by CORS policy » dans la console | Le serveur Apps Script n'est pas ouvert à « Tout le monde », ou n'a pas la nouvelle version | Mêmes réglages que ci-dessus |

## Sécurité : ce qu'il faut savoir

- Les en-têtes de `firebase.json` interdisent tout script en ligne, toute bibliothèque tierce, l'intégration de la page dans un autre site, et limitent les connexions du navigateur à `script.google.com` et `script.googleusercontent.com`. Une faille d'injection de contenu serait donc beaucoup plus difficile à exploiter. Ne les affaiblissez pas sans raison.
- L'adresse `/exec` est **publique** : n'importe qui peut l'appeler. Seules les fonctions listées dans `api_()` de `Code.gs` répondent, et chacune vérifie elle-même la session et les droits du rôle, exactement comme avant. La connexion est limitée (5 essais puis 10 minutes de blocage), et l'inscription publique est protégée par un champ piège, une question de vérification et un plafond par heure.
- Le jeton de session est gardé dans l'onglet du navigateur (il disparaît à sa fermeture) et jamais dans un cookie.
- L'adresse de l'application Apps Script d'origine continue de fonctionner. Si vous ne voulez qu'une seule porte d'entrée, communiquez uniquement l'adresse Firebase.
- Les clés Twilio et les secrets de passerelle restent dans les propriétés du script, jamais dans le classeur ni dans la page.

## Limites connues

- Je n'ai pas pu tester contre un vrai déploiement Google : les tests simulent Apps Script autour du vrai `Code.gs` (voir `tests/ui_firebase.py`). La méthode d'appel (envoi en texte brut, redirection suivie) est celle que décrivent les réponses les plus courantes sur le sujet, mais **le premier essai réel peut révéler un détail** : signalez le message d'erreur exact, il sera corrigé.
- La redirection que Google ajoute vers `script.googleusercontent.com` n'est pas reproduite par les tests. La politique de sécurité l'autorise déjà.
- Les liens de connexion ne figurent pas encore dans les messages envoyés aux familles (identifiant et mot de passe provisoire, sans adresse du site) : prévoyez de communiquer l'adresse Firebase séparément.
