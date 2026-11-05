# Publier Scolaria avec GitHub Pages

GitHub Pages **sert la page** de l'application à l'adresse de votre dépôt, par exemple `https://gainde4.github.io/scolaria/`. Les **données et la logique** restent sur Google Apps Script et Google Sheets, comme dans [DEPLOIEMENT.md](DEPLOIEMENT.md).

```
Navigateur ──► GitHub Pages (la page, gratuit, rien à installer)
     │
     └──────► Google Apps Script (le serveur) ──► Google Sheets (les données)
```

Tout se fait depuis le site de GitHub et celui de Google, dans le navigateur. Compter 15 à 20 minutes.

## Ce que vous voyez au départ

Tant que l'adresse du serveur n'est pas renseignée, `https://gainde4.github.io/scolaria/` affiche l'écran **« Scolaria n'est pas encore connectée à un serveur »**, avec un bouton « Voir la démonstration ». La démonstration est aussi accessible directement à `https://gainde4.github.io/scolaria/demo.html` : école fictive, données gardées dans votre navigateur, rien n'est envoyé nulle part.

Ces fichiers sont à la racine du dépôt (c'est ce que GitHub Pages sert) :

| Fichier | Rôle |
|---|---|
| `index.html` | L'application connectée au serveur |
| `demo.html` | La démonstration sans serveur |
| `config.js` | **L'adresse de votre serveur Apps Script** : le seul fichier à modifier |
| `app.….js`, `app.….css`, `libs/` | Le code de l'application et ses bibliothèques (ne pas modifier) |

## Étapes

### 1. Créer le serveur Apps Script (10 minutes)

Pas besoin de Google Sheets ni de la page `Index` : le serveur crée lui-même son classeur « Scolaria — données » dans votre Drive au premier appel.

1. Ouvrez <https://script.google.com> et cliquez sur **Nouveau projet**. Donnez-lui un nom (« Scolaria »).
2. Supprimez le code d'exemple et collez **tout** le contenu de `Code.gs` (dossier `dist/gas/` du dépôt, ou l'archive `scolaria-apps-script.zip`). Enregistrez (Ctrl + S).
3. *Recommandé* : roue dentée **Paramètres du projet** → cochez « Afficher le fichier manifeste appsscript.json », puis remplacez le contenu de ce fichier par celui de `appsscript.json` (fuseau horaire Dakar, droits demandés).
4. **Déployer → Nouveau déploiement** → roue dentée → **Application Web**. *Exécuter en tant que* : **Moi**. *Qui a accès* : **Tout le monde** (l'application a sa propre connexion par mot de passe). Cliquez sur **Déployer**.
5. **Autorisez l'accès** quand Google le demande. Un écran « Google n'a pas validé cette application » apparaît : c'est normal, vous en êtes l'auteur. Cliquez sur **Paramètres avancés → Accéder à Scolaria (non sécurisé) → Autoriser**.
6. Copiez l'**URL de l'application Web** (elle se termine par `/exec`). Vérifiez-la en ouvrant cette adresse suivie de `?ping=1` dans le navigateur : vous devez voir `{"ok":true,"app":"Scolaria"}`.

Si vous aviez déjà déployé une version précédente : remplacez le code, puis **Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer**. L'adresse ne change pas. Sans nouvelle version, l'ancien code répond encore et le site ne peut pas l'utiliser.

### 2. Coller l'adresse dans `config.js`, sur GitHub

1. Sur la page du dépôt, cliquez sur le fichier **`config.js`**, puis sur le **crayon** (« Edit this file »).
2. Remplacez `COLLEZ_ICI_ADRESSE_DU_SERVEUR/exec` par votre adresse, en gardant les guillemets :

   ```js
   window.SCOLARIA_API = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```
3. **Commit changes** (bouton vert), directement sur la branche `main`.
4. Patientez 1 à 2 minutes : GitHub republie le site (onglet **Actions** du dépôt, « pages build and deployment »). Rechargez la page avec **Ctrl + F5**.

Seules les adresses `https://script.google.com/…/exec` sont acceptées (les comptes Google Workspace ont `https://script.google.com/a/macros/votre-domaine/s/…/exec`, qui convient aussi). Ne mettez **jamais** de mot de passe ni de clé dans `config.js` : ce fichier est public.

### 3. Premier lancement

Ouvrez `https://gainde4.github.io/scolaria/`. L'application propose de **créer le compte de la direction**. S'il existe déjà, l'écran de connexion apparaît, avec le bouton « Inscrire mon enfant » pour les familles.

### Réglage de GitHub Pages (déjà fait si le README s'affichait)

Dépôt → **Settings → Pages** : *Source* = « Deploy from a branch », *Branch* = `main`, dossier = `/ (root)`. Un nom de domaine personnalisé se règle au même endroit (le certificat HTTPS est gratuit).

## Mettre à jour plus tard

- **Ne remplacez pas `config.js`** quand vous mettez à jour les autres fichiers : il contient votre adresse.
- **Le serveur** : collez le nouveau `Code.gs` dans Apps Script, puis créez une **nouvelle version** du déploiement.

## Pages ou Firebase ?

| | GitHub Pages | Firebase Hosting |
|---|---|---|
| Installation | Aucune (tout dans le navigateur) | Ligne de commande (`firebase deploy`) |
| Coût | Gratuit, dépôt public | Gratuit (plan Spark), sans carte bancaire |
| Politique de sécurité | Dans la page (balise `meta`) : bloque les scripts injectés et limite les connexions | En-têtes HTTP : idem, plus interdiction d'être intégré dans un autre site au niveau du navigateur |
| Protection contre l'intégration dans un cadre | Assurée par l'application elle-même (elle se masque si elle est dans un cadre) | En-têtes `X-Frame-Options` et `frame-ancestors` |
| Limites indicatives | Site de 1 Go, 100 Go de trafic par mois (limite « souple ») | 360 Mo de transfert par jour |

Pour une petite école, GitHub Pages suffit. Pour une exposition plus large, Firebase offre des protections un peu plus solides : voir [FIREBASE.md](FIREBASE.md).

## Sécurité : ce qu'il faut savoir

- **Le dépôt est public, donc tout le code l'est.** Il ne contient aucun secret : les clés Twilio et les secrets de passerelle sont enregistrés dans les propriétés du script Apps Script, jamais dans le dépôt, la page ou le classeur.
- L'adresse `/exec` est **publique** : n'importe qui peut l'appeler. Seules les fonctions listées dans `api_()` de `Code.gs` répondent, et chacune vérifie la session et les droits du rôle. La connexion est limitée (5 essais puis 10 minutes de blocage) et l'inscription publique est protégée (champ piège, question de vérification, plafond par heure).
- Le jeton de session reste dans l'onglet du navigateur (il disparaît à sa fermeture), jamais dans un cookie.
- La page n'accepte aucun script en ligne ni bibliothèque venant d'un autre site, et ne peut contacter que `script.google.com`.

## Si quelque chose ne marche pas

| Ce que vous voyez | Cause probable | Que faire |
|---|---|---|
| Le README s'affiche encore | Le site n'est pas encore republié, ou `index.html` n'est pas à la racine de `main` | Attendre 2 minutes, **Ctrl + F5** ; vérifier Settings → Pages (branche `main`, dossier `/ (root)`) |
| Erreur 404 | GitHub Pages n'est pas activé | Settings → Pages, comme ci-dessus |
| « Scolaria n'est pas encore connectée à un serveur » | `config.js` contient encore le texte d'exemple, ou une adresse qui n'est pas `https://script.google.com/…/exec` | Modifier `config.js` (étape 2) |
| « Serveur injoignable » | Pas d'Internet, adresse fausse, ou nouveau déploiement créé au lieu d'une nouvelle *version* (l'adresse a alors changé) | Tester `…/exec?ping=1` ; vérifier l'adresse dans `config.js` |
| « Réponse inattendue du serveur » | Accès Apps Script restreint, ancien `Code.gs` sans `doPost`, ou quota Google dépassé | Accès **Tout le monde** ; coller le nouveau `Code.gs` et créer une nouvelle version |
| « Affichage bloqué » | La page est affichée dans un cadre d'un autre site | Ouvrir l'adresse directement dans le navigateur |

Pour tout autre problème, appuyez sur **F12** et regardez l'onglet **Console** : envoyez-moi le message exact.

## Limites connues

- Je n'ai pas pu tester contre un vrai déploiement Google ni contre un vrai GitHub Pages : les tests simulent Apps Script autour du vrai `Code.gs` (voir `tests/ui_firebase.py pages`). La méthode d'appel (envoi en texte brut, redirection suivie) est celle que décrivent les réponses les plus courantes sur le sujet, mais **le premier essai réel peut révéler un détail**.
- La redirection que Google ajoute vers `script.googleusercontent.com` n'est pas reproduite par les tests. La politique de sécurité l'autorise déjà.
- Les messages envoyés aux familles ne contiennent pas encore l'adresse du site (identifiant et mot de passe provisoire seulement) : communiquez l'adresse séparément.
