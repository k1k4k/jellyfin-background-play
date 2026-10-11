<p align="center">
  <img src="icon.png" width="520" alt="Jellyfin Background Play">
</p>

<p align="center">
  <a href="https://github.com/k1k4k/jellyfin-background-play/releases/latest"><img src="https://img.shields.io/github/v/release/k1k4k/jellyfin-background-play?label=version&color=00a4dc" alt="Dernière version"></a>
  <img src="https://img.shields.io/badge/Jellyfin-12.x%20%7C%2010.11-00a4dc?logo=jellyfin&logoColor=white" alt="Jellyfin 12.x | 10.11">
  <a href="https://github.com/k1k4k/jellyfin-background-play/releases"><img src="https://img.shields.io/github/downloads/k1k4k/jellyfin-background-play/total?color=aa5cc3" alt="Téléchargements"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/k1k4k/jellyfin-background-play?color=555" alt="Licence MIT"></a>
</p>

<p align="center">
  <b>Quitter le lecteur ne coupe plus la vidéo.</b><br>
  Elle continue en fond avec la mini barre de lecture de la musique, le temps de parcourir la bibliothèque.
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#fonctionnalités">Fonctionnalités</a> ·
  <a href="#dépannage">Dépannage</a> ·
  <a href="README.md">English version</a>
</p>

<p align="center"><img src="docs/screen-bar.png" width="640" alt="Une page de série avec la mini barre de lecture en bas : la vidéo continue pendant la navigation"></p>

## Fonctionnalités

### En quittant le lecteur

- **La vidéo continue** : flèche retour, retour du navigateur ou du téléphone, lien vers une autre page… la lecture ne s'arrête plus.
- **La même barre que pour la musique** en bas de l'écran : lecture / pause, **stop**, épisode précédent / suivant, position, volume. Un clic sur la barre (ou sur <code>⤢</code>) ramène au lecteur, là où en est la vidéo.
- **L'épisode suivant s'enchaîne en fond**, sans réafficher le lecteur.
- Lancer autre chose (un film, une autre série) rouvre le lecteur normalement ; lancer de la musique arrête la vidéo et laisse la place à la barre de la musique.

### Dans le lecteur

- **Bouton stop** (carré) à côté de pause, et **croix en haut à droite** : pour arrêter la vidéo et quitter le lecteur, puisque la flèche retour ne le fait plus.

### Partout

- Bureau et mobile : sur écran étroit, pause et stop restent accessibles à droite de la barre.
- Fonctionne avec [Jellyfin Player Queue](https://github.com/k1k4k/jellyfin-player-queue).
- En français ou en anglais selon la langue du navigateur.

<p align="center"><img src="docs/screen-player.png" width="520" alt="Le lecteur : bouton stop à côté de pause, croix en haut à droite"></p>

## Installation

### Plugin (recommandé)

1. **Tableau de bord → Extensions → Gérer les dépôts → `+`**, puis l'adresse du dépôt de plugins k1k4k qui correspond à votre Jellyfin :

   | Jellyfin | Adresse du dépôt |
   |---|---|
   | 12.x | `https://k1k4k.github.io/jellyfin-plugins/manifest.json` |
   | 10.11.x | `https://k1k4k.github.io/jellyfin-plugins/manifest-10.11.json` |

   Ce dépôt liste tous les plugins k1k4k (Background Play, Player Queue…). Si vous avez déjà ajouté le dépôt de Player Queue, rien à faire : Background Play y apparaît aussi.

2. **Extensions → Disponible → Jellyfin Background Play → Installer**, puis redémarrez Jellyfin.
3. `Ctrl+F5` dans le navigateur.

Le plugin injecte le script à chaque chargement de la page : aucun fichier de Jellyfin n'est modifié, et rien n'est à refaire après une mise à jour de Jellyfin, y compris en Docker. Les nouvelles versions arrivent par le tableau de bord. La page de configuration du plugin permet de le désactiver sans le désinstaller.

<details>
<summary><b>Autres méthodes (sans le dépôt, ou sans plugin)</b></summary>

#### Plugin, à la main

Téléchargez le zip de la [dernière version](https://github.com/k1k4k/jellyfin-background-play/releases/latest) (`_jf12` pour Jellyfin 12, `_jf10` pour 10.11), dézippez-le dans `<config>/plugins/BackgroundPlay/` et redémarrez Jellyfin.

#### JavaScript Injector

Si vous utilisez déjà [JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) : ajoutez un script et collez le contenu de [`jellyfin-background-play.js`](jellyfin-background-play.js).

#### Script d'installation

Copie le `.js` dans le dossier web de Jellyfin et ajoute une balise `<script>` dans `index.html` (sauvegarde créée la première fois).

> [!WARNING]
> Une mise à jour de Jellyfin remplace `index.html` : il faut relancer le script. **En Docker, chaque mise à jour de l'image efface l'installation** : préférez le plugin.

```powershell
# Windows
.\install.ps1                                   # détection automatique
.\install.ps1 -WebDir "\\SERVEUR\jellyfin\web"  # dossier local ou partage réseau
.\install.ps1 -Uninstall
```

```bash
# Linux
sudo ./install.sh                               # détection automatique
sudo ./install.sh /usr/share/jellyfin/web
```

Si `index.html` n'est pas modifiable mais que le dossier l'est (dossier web partagé en Samba, fichier appartenant à root), `install.ps1` met l'original de côté en `index.html.bgplay.orig` ; `-Uninstall` le restaure.

#### À la main

Copiez `jellyfin-background-play.js` à côté de `index.html` dans le dossier web, et ajoutez juste avant `</head>` :

```html
<script defer="defer" src="jellyfin-background-play.js"></script>
```

</details>

## Compatibilité

| | |
|---|---|
| **Jellyfin 12.x** | testé (12.1.0) |
| **Jellyfin 10.11** | plugin compilé, non testé (le code de Jellyfin concerné est identique à la 12.1) |
| **Navigateur** (bureau, mobile) | oui |
| **Applications qui affichent l'interface web** (Jellyfin Media Player, appli Android) | devrait fonctionner, non testé |
| **Applications natives** (Android TV, Swiftfin, Findroid…) | non : elles n'utilisent pas le lecteur web |
| **Mode TV, Chromecast, lecture à distance** | comportement d'origine de Jellyfin |

Le script ne modifie pas Jellyfin : il retrouve le lecteur interne par son contenu, il n'est donc pas lié à un build précis.

## Dépannage

- **La vidéo s'arrête toujours en quittant le lecteur** : ouvrez la console du navigateur (`F12`). Vous devez y voir `[BackgroundPlay] v… – playbackManager found, appRouter found`. Si c'est `playbackManager not found`, votre version de Jellyfin n'est pas reconnue : [ouvrez une issue](https://github.com/k1k4k/jellyfin-background-play/issues) en l'indiquant.
- **Rien dans la console** : le script n'est pas chargé. Videz le cache (`Ctrl+F5`). Avec le script d'installation, vérifiez la balise dans `index.html` et relancez l'installation après chaque mise à jour de Jellyfin.
- **L'épisode suivant réaffiche le lecteur** : la console indique `appRouter not found`. Ouvrez une issue avec votre version de Jellyfin.

<details>
<summary><b>Développement</b></summary>

#### Script client

Le script se teste sur un banc d'essai local, `web-dev/` : une copie de l'interface web de Jellyfin servie depuis votre machine, qui parle à un vrai serveur Jellyfin. Le serveur lui-même n'est jamais modifié. Ce dossier n'est pas dans le dépôt (c'est le code de Jellyfin, et sa configuration contient l'adresse de votre serveur) ; on le crée une fois :

1. Copiez le dossier web de Jellyfin (celui qui contient `index.html`) dans `web-dev/`. Il se trouve dans `C:\Program Files\Jellyfin\Server\jellyfin-web` sous Windows, `/usr/share/jellyfin/web` sous Linux, `/jellyfin/jellyfin-web` dans l'image Docker officielle. Prenez la même version de Jellyfin que votre serveur.
2. Dans `web-dev/config.json`, mettez `"multiserver": true` et l'adresse de votre serveur dans `"servers"`, par exemple `["http://192.168.1.10:8096"]`.
3. Copiez `jellyfin-background-play.js` dans `web-dev/`, et dans `web-dev/index.html` ajoutez juste avant `</head>` :
   ```html
   <script defer="defer" src="jellyfin-background-play.js"></script>
   ```
4. Servez le dossier, puis ouvrez `http://localhost:8098` et connectez-vous :
   ```powershell
   python -m http.server 8098 --directory web-dev --bind 127.0.0.1
   ```

Après chaque modification du script, recopiez-le dans `web-dev/` et rechargez avec `Ctrl+F5`. Le même `web-dev/` peut servir aussi les autres scripts (Player Queue) pour tester l'ensemble.

#### Plugin

`Jellyfin.Plugin.BackgroundPlay/` : une source, deux cibles, `-p:JellyfinTarget=jf12` (Jellyfin 12, .NET 10, par défaut) et `jf10` (Jellyfin 10.11, .NET 9). `jellyfin-background-play.js` est embarqué tel quel. Sans SDK local :

```bash
docker run --rm -v "$PWD:/src" -w /src mcr.microsoft.com/dotnet/sdk:10.0 dotnet build Jellyfin.Plugin.BackgroundPlay/Jellyfin.Plugin.BackgroundPlay.csproj -c Release -o out/jf12
```

#### Publier une version

1. Mettre à jour `VERSION` dans `jellyfin-background-play.js` et `<Version>` / `<AssemblyVersion>` dans le csproj ; ajouter une section `## X.Y.Z` dans `CHANGELOG.md`.
2. `git tag vX.Y.Z && git push origin vX.Y.Z` : le workflow **Release** compile les deux cibles, publie la release et met à jour les manifestes sur `main`. Le dépôt central [`jellyfin-plugins`](https://github.com/k1k4k/jellyfin-plugins) les reprend à son passage suivant (toutes les heures, ou tout de suite avec le secret `PLUGINS_REPO_TOKEN`).

</details>

## Licence

MIT, voir [LICENSE](LICENSE).
