# Sujets actifs (topics)

Un workflow n8n par sujet, déclaré dans `configs/<slug>.js`. Tout le pipeline (génération du workflow, push dans n8n, publication des métadonnées dans le hub blog, redémarrage du cache) est exécuté par **une seule commande**.

## Outils

| Script | Usage | Quand l'utiliser |
| --- | --- | --- |
| `new.js` | `node n8n-workflows/topics/new.js <slug> "<label>" "<description>" [mode]` | Créer un fichier config pré-rempli pour un nouveau sujet. |
| `sync.js` | `node n8n-workflows/topics/sync.js` | Après avoir créé/modifié un config : enchaîne build + push n8n + sync hub + restart n8n. |
| `remove.js` | `node n8n-workflows/topics/remove.js <slug>` | Supprime proprement un sujet partout (config, workflow, topic + posts + articles). |
| `build.js` | `node n8n-workflows/topics/build.js` | Sous-étape : regénère uniquement les `<slug>.json` depuis les configs. |
| `push-all.js` | `node n8n-workflows/topics/push-all.js` | Sous-étape : pousse les `<slug>.json` dans la BDD n8n. |
| `sync-meta.js` | `node n8n-workflows/topics/sync-meta.js` | Sous-étape : pousse label / description / mode dans la BDD blog. |

En usage normal tu n'as à connaître que **`new.js`**, **`sync.js`** et **`remove.js`**.

## Ajouter un sujet (workflow type)

```powershell
node n8n-workflows/topics/new.js f1 "Formule 1" "Grand Prix, écuries, paddock, FIA." fr-intl
# → crée configs/f1.js avec un squelette commenté

# Édite configs/f1.js : ajoute tes sources, mots-clés, hints éditoriaux.

node n8n-workflows/topics/sync.js
# → build + push n8n + sync hub + restart n8n. C'est tout.
```

Dans n8n, le workflow `Recap Formule 1` apparaît immédiatement (désactivé par défaut). Tu actives quand tu es prêt.

## Modifier un sujet existant

```powershell
# Édite configs/<slug>.js (sources, mots-clés, description, mode...).
node n8n-workflows/topics/sync.js
```

La modification est propagée à n8n (code à jour dans le workflow) ET au hub blog (description visible immédiatement).

## Supprimer un sujet

```powershell
node n8n-workflows/topics/remove.js <slug>
# Confirmation interactive ; ajoute --yes pour skipper.
```

Supprime : le fichier config, le `<slug>.json`, le workflow n8n (avec son historique), le topic dans le hub (avec ses posts et articles).

## Sujets fournis

| Slug | Label | Mode | Sources principales |
| --- | --- | --- | --- |
| `esport` | Esport | fr-intl | Team-aAa, HLTV, Dot Esports, Dexerto, Esports Insider |
| `gaming` | Gaming | fr-intl | Gamekult, Jeuxvideo.com, Polygon, Eurogamer, PC Gamer, IGN |
| `cinema-series` | Cinéma & Séries | fr-intl | AlloCiné, Variety, Hollywood Reporter, Deadline, IndieWire |
| `general` | Actu générale | fr-intl | Le Monde, Le Figaro, France Info, BBC, The Guardian, CNN |
| `sport` | Sport | fr-intl | L'Équipe, RMC Sport, Eurosport, ESPN, BBC Sport |
| `tech-ia` | Tech & IA | fr-intl | Numerama, Frandroid, 01net, The Verge, TechCrunch, Ars Technica |

## Architecture

```
topics/
├── configs/             ← seul endroit à éditer pour modifier un sujet
│   └── <slug>.js
├── new.js               ← scaffolder
├── sync.js              ← commande tout-en-un (build + push + meta + restart)
├── remove.js            ← suppression propre
├── build.js             ← sous-étape : configs → .json
├── push-all.js          ← sous-étape : .json → BDD n8n
├── sync-meta.js         ← sous-étape : configs → BDD blog
└── <slug>.json          ← workflow n8n généré (un par sujet)
```

## Bon à savoir

- **Tous les sujets se déclenchent en même temps** (06h, 11h, 18h, 23h). Le throttle Gemini gère la file d'attente — voir `README.md` racine, section "Anti-rate-limit Gemini".
- **Le fallback éditorial** (sans IA) cite directement les titres d'articles. Plus aucune mention "France : X articles" ou "Sources à vérifier" n'est exposée publiquement.
- **Le template parent** `n8n-workflows/topic-recap-template.json` ne doit pas tourner en prod : il sert uniquement de référence pour générer les sujets. Il est désactivé par défaut, ne le touche pas.
- **Tu peux relancer `sync.js` autant de fois que tu veux** : la commande est idempotente. Elle préserve l'état actif/inactif des workflows, leurs schedules, leurs historiques d'exécution et leurs posts publiés.
