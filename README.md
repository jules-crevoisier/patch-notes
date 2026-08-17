# patch-notes.fr

Hub de veille multi-sujets. Pour chaque sujet, un scheduler cron interne au blog collecte les sources (RSS et Google News), filtre les doublons du jour, génère un titre + un résumé via Gemini, et publie directement en base. Tout tourne en **Docker Compose**, persisté dans **PostgreSQL**.

## Sommaire

- [Architecture](#architecture)
- [Démarrer en local](#démarrer-en-local)
- [Variables d'environnement](#variables-denvironnement)
- [Ajouter un sujet](#ajouter-un-sujet)
- [Modes FR / INT / FR + INT](#modes-fr--int--fr--int)
- [Anti-rate-limit Gemini](#anti-rate-limit-gemini)
- [Endpoints API](#endpoints-api)
- [SEO](#seo)
- [Déploiement](#déploiement)

## Architecture

```
┌───────────────────────────────────────────┐
│              Blog (Node 22)                │
│  SSR + API REST + cron scheduler interne   │
│                                             │
│  blog/automation/                          │
│   ▸ scheduler.js  (node-cron, 4x/jour)     │
│   ▸ run-topic.js  (fetch → Gemini → save)  │
│   ▸ gemini-queue.js (throttle en mémoire)  │
└───────────────────┬───────────────────────┘
                    │ Prisma
                    ▼
          ┌─────────────────────┐
          │   Postgres 16       │
          │   DB patch_notes    │
          │   (topics, posts,   │
          │    articles)        │
          └─────────────────────┘
                    │
                    ▼ HTTP
                visiteur web
```

- **`blog/`** — serveur Node sans framework. SSR de la home, des pages sujet et des recaps. API REST. Sitemaps + RSS + JSON-LD.
- **`blog/automation/`** — scheduler cron interne (`node-cron`) + pipeline de récap (fetch RSS/Google News → dédoublonnage → Gemini avec throttle en mémoire → fallback sans IA → publication directe en base). Un sujet = un fichier de config dans `blog/automation/topics/configs/`.
- **`db/init/`** — scripts d'init Postgres exécutés au premier démarrage du conteneur (création de la base `patch_notes` + extensions).
- **`docker-compose.yml`** — orchestration `postgres` + `blog`.

Persistance :

- Les **récaps** sont stockés en Postgres (`patch_notes.posts`, `patch_notes.articles`).
- Le **state** Docker (volumes) survit aux `docker compose up/down`.

## Démarrer en local

Pré-requis : Docker Desktop, PowerShell.

```powershell
Copy-Item .env.example .env
# Édite .env : mets POSTGRES_PASSWORD, BLOG_SECRET, GEMINI_API_KEY.

docker compose up -d --build
```

URLs locales :

- Blog : http://localhost:3001
- Sujet esport : http://localhost:3001/esport
- Hub : http://localhost:3001
- Sitemap (index) : http://localhost:3001/sitemap.xml
- RSS esport : http://localhost:3001/esport/feed.xml

Premier démarrage :

1. Postgres crée la base `patch_notes` (script `db/init/01-create-blog-db.sql`).
2. Le service `blog` lance `db.ensureSchema()` : ping de connexion (le schéma lui-même est appliqué par `prisma migrate deploy` au boot du conteneur).
3. Le scheduler interne (`blog/automation/scheduler.js`) upserte chaque sujet trouvé dans `blog/automation/topics/configs/*.js` puis enregistre ses 4 jobs cron (6h, 11h, 18h, 23h).

Pour publier un premier recap sans attendre le prochain créneau cron, lance manuellement un sujet :

```powershell
docker compose exec blog node automation/run-now.js esport
```

## Variables d'environnement

Voir `.env.example` pour la liste à jour. Les plus importantes :

| Variable | Rôle |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Cluster Postgres. |
| `BLOG_DB` | Nom de la base du blog (par défaut `patch_notes`). |
| `BLOG_SECRET` | Secret pour les routes d'écriture externes de l'API (`x-blog-secret`). |
| `SITE_URL` | URL publique du site, utilisée dans canonical, sitemap, RSS, JSON-LD. |
| `SITE_NAME`, `SITE_DESCRIPTION`, `SITE_OG_IMAGE` | Métadonnées globales SEO / OpenGraph. `SITE_OG_IMAGE` pointe vers `blog/public/og.jpg`. |
| `GOOGLE_SITE_VERIFICATION` | Code balise HTML Search Console (optionnel tant que non configuré). |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Clé Google Gemini + modèle. |
| `GEMINI_MAX_PER_MINUTE` | Quota d'appels Gemini par minute (anti-rate-limit, en mémoire dans le process blog). |
| `GEMINI_MAX_WAIT_SECONDS` | Au-delà, le pipeline bascule en récap fallback (sans IA) plutôt que d'attendre. |
| `TZ` | Fuseau horaire du conteneur (le scheduler cron force `Europe/Paris` pour ses triggers, indépendamment de `TZ`). |

## Ajouter un sujet

> 🎯 **Guide complet** : [`docs/topics-guide.md`](docs/topics-guide.md) explique pas à pas comment trouver de bonnes sources RSS, choisir tes mots-clés, régler le mode FR/INT/FR+INT, tester un sujet et fournit plusieurs exemples prêts à coller.

Un sujet = un fichier `blog/automation/topics/configs/<slug>.js`. Aucun autre endroit à modifier.

```powershell
node blog/automation/topics/new.js tech-ia "Tech / IA" "IA, plateformes, produits, régulation, usages tech." fr-intl
# → crée blog/automation/topics/configs/tech-ia.js avec un squelette

# Édite blog/automation/topics/configs/tech-ia.js : sources, mots-clés, hints éditoriaux.

docker compose restart blog
# → recharge la liste des sujets ; le nouveau sujet est upserté en base et
#   ses 4 jobs cron sont enregistrés au démarrage.
```

Voir `blog/automation/topics/README.md` pour le détail (scaffolding, suppression d'un sujet).

Le blog crée automatiquement les routes :

- `/<slug>` (page sujet, paginée)
- `/<slug>/recap/<id>` (page de détail d'un récap, JSON-LD `NewsArticle`)
- `/<slug>/feed.xml` (RSS du sujet)
- `/sitemap-<slug>.xml` (sitemap dédié, agrégé par `/sitemap.xml`)

## Modes FR / INT / FR + INT

Chaque sujet définit `mode` :

- `'fr'` — uniquement les sources FR. Les sources `region: 'intl'` sont **ignorées automatiquement**, tu peux donc laisser toutes tes sources dans le tableau sans les enlever.
- `'intl'` — uniquement les sources internationales.
- `'fr-intl'` *(défaut)* — les deux. La page sujet affiche deux colonnes France / International quand les deux ont des articles.

Le mode est aussi stocké côté Postgres (colonne `posts.mode`), donc tu peux le changer plus tard sans casser les anciens récaps.

## Anti-rate-limit Gemini

Les 4 créneaux (06h, 11h, 18h, 23h) déclenchent tous les sujets en même temps. Avec N sujets, on tape vite la limite par minute du tier Gemini (5 RPM par défaut sur le free tier).

`blog/automation/gemini-queue.js` implémente une **file d'attente en mémoire**, dans le process blog (pas de table ni de verrou Postgres nécessaire : un seul process, donc aucune réservation concurrente à sérialiser) :

- `enqueue(task, { topicSlug })` retourne une Promise résolue une fois l'appel Gemini effectué (ou refusé).
- Sémantique de quota : "max appels par minute glissante", au plus `GEMINI_MAX_PER_MINUTE` appels dans n'importe quelle fenêtre de 60 secondes.

Comportement (avec quota 5 RPM) :

| N° du sujet à traiter | Attente avant Gemini | Slot programmé |
| --- | --- | --- |
| 1 → 5 | 0 s | immédiat |
| 6 → 10 | ~60 s | +1 min |
| 11 → 15 | ~120 s | +2 min |
| 16 → 20 | ~180 s | +3 min |
| ... | et ainsi de suite | ... |

Algorithme :

1. On prune les timestamps d'appels de plus de 60s.
2. Si moins de `GEMINI_MAX_PER_MINUTE` appels sont "vivants" dans la fenêtre, l'appel part immédiatement.
3. Sinon, le prochain slot libre est calculé juste après que le `(len - max)`-ième appel sorte de la fenêtre 60s (`+60s +200ms` de marge).
4. `GEMINI_MAX_WAIT_SECONDS` est le garde-fou : si le délai calculé dépasse cette borne, l'appel est refusé (`{ ok: false, reason: 'rate-limit-cap-exceeded' }`) **sans jamais appeler Gemini**, et le sujet publie son fallback éditorial (sans IA).

Tu peux ajuster `GEMINI_MAX_PER_MINUTE` dans `.env` selon ton plan Gemini (free = 5, Tier 1 payant = 250).

## Endpoints API

| Méthode | Route | Auth | Usage |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Healthcheck Postgres + serveur. |
| `GET` | `/sitemap.xml` | — | Sitemap index (un sitemap par sujet). |
| `GET` | `/sitemap-core.xml`, `/sitemap-<slug>.xml` | — | Sitemaps détaillés. |
| `GET` | `/<slug>/feed.xml` | — | Flux RSS du sujet. |
| `GET` | `/api/topics` | — | Liste des sujets avec compteurs. |
| `GET` | `/api/posts/:id` | — | Récap unique en JSON. |
| `GET` | `/api/topics/:slug/posts?offset&limit&q` | — | Liste paginée + recherche trigram. |
| `GET` | `/api/topics/:slug/same-day-urls?date=YYYY-MM-DD` | — | URLs du jour pour anti-doublon (consommé en interne par le pipeline). |
| `POST` | `/api/posts` | `x-blog-secret` | Publication d'un récap. Filtre les doublons du jour. |
| `PUT` | `/api/topics` | `x-blog-secret` | Crée / met à jour un sujet (mode, label, description). |

Le pipeline de récap interne (`blog/automation/run-topic.js`) appelle `db.createPost` / `db.getSameDayUrlKeys` / `db.upsertTopic` directement en process, sans passer par HTTP ni `BLOG_SECRET`.

## SEO

Mis en place côté serveur :

- **Rendu HTML serveur** sur la home, la page sujet, la page recap (lisible sans JavaScript).
- **Métadonnées par page** : `<title>`, `<meta description>`, `<link rel=canonical>`.
- **OpenGraph** + **Twitter Card** (`og:type`, `og:image` 1200×630, `twitter:card`…).
- **Pages `/actu/`** indexées dans le sitemap (priorité 0.85).
- **JSON-LD** :
  - `WebSite` + `SearchAction` sur la home.
  - `CollectionPage` + `ItemList` + `BreadcrumbList` sur la page sujet.
  - `NewsArticle` + `BreadcrumbList` + `citation[]` sur chaque recap.
- **Sitemap index** (`/sitemap.xml`) qui agrège un sitemap par sujet (`/sitemap-<slug>.xml`).
- **`robots.txt`** explicite, `Cache-Control` adapté à chaque type de contenu.
- **RSS 2.0** par sujet.

À configurer côté infra production :

1. Image OG : `blog/public/og.jpg` + `SITE_OG_IMAGE=https://patch-notes.fr/og.jpg`.
2. Google Search Console : voir le guide pas à pas [`docs/seo-setup.md`](docs/seo-setup.md).
3. Soumettre `https://patch-notes.fr/sitemap.xml` dans Search Console (et Bing Webmaster Tools).
4. HTTPS obligatoire (Apache devant le port 3001, cf. `apache/README.md`).

## Déploiement

### Dokploy (recommandé)

Déploiement autonome avec HTTPS, volume Postgres persistant et **auto-deploy GitHub** :

→ **[DOKPLOY.md](DOKPLOY.md)** — guide pas à pas complet.

Fichier Compose : `docker-compose.dokploy.yml`.

### VPS Docker + Apache

1. Pointer `patch-notes.fr` vers le VPS.
2. `git clone` du repo.
3. `cp .env.production.example .env` puis remplir.
4. `./scripts/deploy.sh`
5. Reverse proxy Apache (cf. `apache/README.md`, `DEPLOY.md`).
6. `curl https://patch-notes.fr/health`

### Ajouter un sujet en prod (GitHub)

```powershell
node blog/automation/topics/new.js mon-sujet "Mon sujet" "Description." fr-intl
# édite blog/automation/topics/configs/mon-sujet.js
git add blog/automation/topics/configs/mon-sujet.js
git commit -m "add | sujet mon-sujet"
git push
```

Dokploy (auto deploy) ou `./scripts/deploy.sh` rebuild le conteneur → le scheduler enregistre le nouveau sujet au démarrage.

Les migrations Prisma s’appliquent au boot (`prisma migrate deploy`). Le scheduler ne rattrape pas les créneaux manqués pendant un redémarrage — le prochain slot (6h/11h/18h/23h) reprend normalement.
