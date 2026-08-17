# Sujets actifs (topics)

Un fichier de config par sujet, dans `configs/<slug>.js`. Le scheduler interne (`blog/automation/scheduler.js`) les charge tous au démarrage du process (`blog/automation/topics.js`, caché pour la durée du process — pas de rechargement à chaud).

## Outils

| Script | Usage | Quand l'utiliser |
| --- | --- | --- |
| `new.js` | `node blog/automation/topics/new.js <slug> "<label>" "<description>" [mode]` | Créer un fichier config pré-rempli pour un nouveau sujet. |
| `remove.js` | `node blog/automation/topics/remove.js <slug>` | Supprime proprement un sujet partout (config + topic/posts/articles en base). |

## Ajouter un sujet (flux en 3 étapes)

```powershell
node blog/automation/topics/new.js f1 "Formule 1" "Grand Prix, écuries, paddock, FIA." fr-intl
# → crée configs/f1.js avec un squelette commenté

# Édite configs/f1.js : ajoute tes sources, mots-clés, hints éditoriaux.

docker compose restart blog
# → recharge la liste des sujets : le nouveau sujet est upserté en base et
#   ses 4 jobs cron (6h/11h/18h/23h) sont enregistrés au démarrage. C'est tout.
```

Vérification immédiate (sans attendre le prochain créneau cron) :

```powershell
docker compose exec blog node automation/run-now.js f1
```

## Modifier un sujet existant

```powershell
# Édite configs/<slug>.js (sources, mots-clés, description, mode...).
docker compose restart blog
```

La modification est propagée au hub (description visible immédiatement) et aux futurs runs cron.

## Supprimer un sujet

```powershell
node blog/automation/topics/remove.js <slug>
# Confirmation interactive ; ajoute --yes pour skipper.
```

Supprime : le fichier config, le topic en base (avec ses posts et articles, cascade). Ajoute ensuite `docker compose restart blog` pour que le scheduler arrête ce sujet.

## Sujets fournis

| Slug | Label | Mode | Sources principales |
| --- | --- | --- | --- |
| `esport` | Esport | fr-intl | Team-aAa, HLTV, Dot Esports, Dexerto, Esports Insider |
| `gaming` | Gaming | fr-intl | Gamekult, Jeuxvideo.com, Polygon, Eurogamer, PC Gamer, IGN |
| `cinema-series` | Cinéma & Séries | fr-intl | AlloCiné, Variety, Hollywood Reporter, Deadline, IndieWire |
| `general` | Actu générale | fr-intl | Le Monde, Le Figaro, France Info, BBC, The Guardian, CNN |
| `sport` | Sport | fr-intl | L'Équipe, RMC Sport, Eurosport, ESPN, BBC Sport |
| `tech-ia` | Tech & IA | fr-intl | Numerama, Frandroid, 01net, The Verge, TechCrunch, Ars Technica |
| `f1` | Formule 1 | fr-intl | L'Équipe F1, Motorsport.com, Autosport, RaceFans |
| `musique` | Musique | fr-intl | Les Inrocks, Konbini, Booska-P, Pitchfork, NME, Billboard |
| `anime-manga` | Anime & Manga | fr-intl | Journal du Japon, Otakia, Manga-News, Anime News Network, MyAnimeList |
| `espace-sciences` | Espace & Sciences | fr-intl | Futura Sciences, Sciences et Avenir, CNRS, Space.com, NASA, Ars Technica |
| `crypto` | Crypto & Web3 | fr-intl | Journal du Coin, Cryptoast, CoinDesk, Cointelegraph, Decrypt |
| `automobile` | Automobile | fr-intl | Caradisiac, Automobile Propre, L'Internaute Auto, Motor1, Electrek |

## Architecture

```
automation/
├── topics.js             ← lit configs/*.js, cache pour la durée du process
├── topics/
│   ├── configs/           ← seul endroit à éditer pour modifier un sujet
│   │   └── <slug>.js
│   ├── new.js              ← scaffolder
│   ├── remove.js           ← suppression propre
│   └── README.md           ← ce fichier
├── pipeline/
│   └── load-topic.js      ← normalise un config brut en { topic, sources }
├── scheduler.js           ← 4 cron jobs/sujet (node-cron, Europe/Paris)
├── run-topic.js           ← orchestre un run complet pour un sujet
├── run-now.js             ← CLI de vérification manuelle
├── gemini-client.js       ← appel HTTP Gemini (jamais de throw)
└── gemini-queue.js        ← throttle en mémoire (sliding window 60s)
```

## Bon à savoir

- **Tous les sujets se déclenchent en même temps** (06h, 11h, 18h, 23h, `Europe/Paris`). Le throttle Gemini gère la file d'attente — voir `README.md` racine, section "Anti-rate-limit Gemini".
- **Le fallback éditorial** (sans IA) cite directement les titres d'articles. Plus aucune mention "France : X articles" ou "Sources à vérifier" n'est exposée publiquement.
- **Aucun rechargement à chaud** : `blog/automation/topics.js` cache la liste des sujets pour la durée du process. Ajouter, éditer ou supprimer un `configs/<slug>.js` nécessite `docker compose restart blog`.
- **Le scheduler ne rattrape pas les créneaux manqués** : si le conteneur redémarre pile pendant un créneau (6h/11h/18h/23h), ce créneau est simplement sauté pour les sujets concernés.
