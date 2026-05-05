# patch-notes.fr

Hub de veille multi-sujets. Pour chaque sujet, n8n collecte les sources (RSS et Google News), filtre les doublons du jour, génère un titre + un résumé via Gemini, et publie sur l'API du blog. Tout tourne en **Docker Compose**, persisté dans **PostgreSQL**.

## Sommaire

- [Architecture](#architecture)
- [Démarrer en local](#démarrer-en-local)
- [Variables d'environnement](#variables-denvironnement)
- [Ajouter un sujet en n8n](#ajouter-un-sujet-en-n8n)
- [Modes FR / INT / FR + INT](#modes-fr--int--fr--int)
- [Anti-rate-limit Gemini](#anti-rate-limit-gemini)
- [Endpoints API](#endpoints-api)
- [SEO](#seo)
- [Déploiement](#déploiement)

## Architecture

```
                  ┌────────────────┐    HTTP (interne)
                  │   n8n          │ ────────────────────┐
                  │  workflows     │                     │
                  └───────┬────────┘                     │
                          │ Postgres (workflows)         │
                          ▼                              ▼
              ┌────────────────────────┐   ┌────────────────────────┐
              │   Postgres 16          │   │   Blog (Node 22)       │
              │   - DB n8n             │◄──┤   SSR + API REST       │
              │   - DB patch_notes     │   │   /api/posts           │
              │     (topics, posts,    │   │   /api/topics/...      │
              │      articles,         │   │   /api/gemini/reserve  │
              │      gemini_calls)     │   │   /<topic>/recap/<id>  │
              └────────────────────────┘   └─────────┬──────────────┘
                                                     │
                                                     ▼ HTTP
                                                 visiteur web
```

- **`blog/`** — serveur Node sans framework. SSR de la home, des pages sujet et des recaps. API REST pour n8n. Sitemaps + RSS + JSON-LD.
- **`n8n-workflows/topic-recap-template.json`** — workflow universel à dupliquer pour chaque sujet (1 sujet = 1 workflow).
- **`n8n-workflows/code/`** — copie lisible du code de chaque nœud, pour relire / faire des PR sans naviguer dans le JSON.
- **`db/init/`** — scripts d'init Postgres exécutés au premier démarrage du conteneur (création de la base `patch_notes` + extensions).
- **`docker-compose.yml`** — orchestration `postgres` + `blog` + `n8n`.

Persistance :

- Les **récaps** sont stockés en Postgres (`patch_notes.posts`, `patch_notes.articles`).
- Les **workflows n8n** sont stockés dans la base `n8n` du même cluster Postgres.
- Le **state** Docker (volumes) survit aux `docker compose up/down`.

## Démarrer en local

Pré-requis : Docker Desktop, PowerShell.

```powershell
Copy-Item .env.example .env
# Édite .env : mets POSTGRES_PASSWORD, BLOG_SECRET, N8N_ENCRYPTION_KEY, GEMINI_API_KEY.

docker compose up -d --build
```

URLs locales :

- Blog : http://localhost:3001
- Sujet esport : http://localhost:3001/esport
- Hub : http://localhost:3001
- Sitemap (index) : http://localhost:3001/sitemap.xml
- RSS esport : http://localhost:3001/esport/feed.xml
- n8n : http://localhost:5678

Premier démarrage :

1. Postgres crée la base `n8n` (POSTGRES_DB) et la base `patch_notes` (script `db/init/01-create-blog-db.sql`).
2. Le service `blog` lance `db.ensureSchema()` : création idempotente des tables `topics`, `posts`, `articles`, `gemini_calls` + index trigram.
3. n8n démarre sur ses tables habituelles dans la base `n8n`.

Importe ensuite le workflow `n8n-workflows/topic-recap-template.json` dans n8n (Menu → Import). Le sujet par défaut est `esport`. Active-le, puis lance manuellement avec « Test workflow » pour vérifier.

## Variables d'environnement

Voir `.env.example` pour la liste à jour. Les plus importantes :

| Variable | Rôle |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Cluster Postgres mutualisé. |
| `BLOG_DB` | Nom de la base du blog (par défaut `patch_notes`). |
| `BLOG_SECRET` | Secret partagé n8n ↔ blog (header `x-blog-secret`). |
| `SITE_URL` | URL publique du site, utilisée dans canonical, sitemap, RSS, JSON-LD. |
| `SITE_NAME`, `SITE_DESCRIPTION`, `SITE_OG_IMAGE` | Métadonnées globales SEO / OpenGraph. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Clé Google Gemini + modèle. |
| `GEMINI_MAX_PER_MINUTE` | Quota global d'appels Gemini par minute (anti-rate-limit). |
| `GEMINI_MAX_WAIT_SECONDS` | Au-delà, n8n bascule en récap fallback (sans IA) plutôt que d'attendre. |
| `BLOG_INTERNAL_URL` | URL atteinte par n8n vers le blog (par défaut `http://blog:3001` dans Compose). |
| `N8N_ENCRYPTION_KEY` | Stable, 32+ caractères, sinon n8n re-crypte les credentials. |

## Ajouter un sujet en n8n

> 🎯 **Guide complet** : [`docs/topics-guide.md`](docs/topics-guide.md) explique pas à pas comment trouver de bonnes sources RSS, choisir tes mots-clés, régler le mode FR/INT/FR+INT, tester un sujet et fournit 5 exemples prêts à coller (esport, gaming, tech-ia, cinéma, F1).

Le workflow est **conçu pour être dupliqué**. Un sujet = un workflow. Il n'y a qu'**un seul nœud à modifier**.

1. Dans n8n, ouvre le workflow `Recap topic - TEMPLATE`.
2. Clic droit → **Duplicate**.
3. Renomme la copie : par exemple `Recap tech-ia`.
4. Ouvre le nœud **« 📝 Configurer le sujet »** (le tout premier nœud de code).
5. Modifie l'objet `TOPIC` :

   ```js
   const TOPIC = {
     slug: 'tech-ia',
     label: 'Tech / IA',
     description: 'IA, plateformes, produits, régulation, usages tech.',
     mode: 'fr-intl',
     searchTerms: '(IA OR "intelligence artificielle" OR OpenAI OR "GPT-5" OR Claude OR Gemini OR cloud OR cybersécurité)',
     positiveKeywords: ['ia', 'openai', 'chatgpt', 'gemini', 'claude', 'cybersecurite', 'cloud', 'startup'],
     negativeKeywords: ['bon plan', 'promo', 'code promo', 'comparatif', 'soldes'],
     maxAgeDays: { google: 4, rss: 7 },
     caps: { fr: 14, intl: 18, total: 36 },
     editorialHints: '- Priorise IA, plateformes, cybersécurité, régulation et usages grand public.',
     sources: [
       { name: 'Numerama', region: 'fr', method: 'google', siteDomain: 'numerama.com', max: 6 },
       { name: 'Le Monde Tech', region: 'fr', method: 'rss', url: 'https://www.lemonde.fr/pixels/rss_full.xml', max: 5 },
       { name: 'The Verge', region: 'intl', method: 'rss', url: 'https://www.theverge.com/rss/index.xml', max: 6 },
       { name: 'Ars Technica', region: 'intl', method: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/index', max: 5 }
     ]
   };
   ```

6. **Save**, puis **Active**. C'est tout.

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

Tous les workflows partagent les mêmes horaires (06h, 11h, 18h, 23h). Avec N sujets, on tape vite la limite par minute du tier Gemini (5 RPM par défaut sur le free tier).

Le blog expose un **scheduler de slots Gemini distribué** :

- `POST /api/gemini/reserve` (header `x-blog-secret`)
- Body : `{ "topicSlug": "esport", "maxPerMinute": 5, "maxWaitSeconds": 1800 }`
- Réponse : `{ "ok": true, "waitMs": 0..N, "scheduledMinute": 0..M, "used": int, "max": int }`

Comportement (avec quota 5 RPM) :

| N° du sujet à réserver | Attente avant Gemini | Slot programmé |
| --- | --- | --- |
| 1 → 5 | 0 s | minute courante |
| 6 → 10 | ~60 s | +1 min |
| 11 → 15 | ~120 s | +2 min |
| 16 → 20 | ~180 s | +3 min |
| ... | et ainsi de suite | ... |

Implémentation :

1. **Verrou Postgres** `pg_advisory_xact_lock(424242)` → un seul workflow réserve à la fois, même si N cron déclenchent en parallèle.
2. On lit toutes les réservations vivantes (`called_at > NOW - 60s`), y compris celles déjà programmées dans le futur.
3. Si on est sous quota → on insère immédiatement, `waitMs = 0`.
4. Sinon → on programme le nouveau slot juste après que la `(len - max)`-ième réservation en sorte de la fenêtre 60s, et on l'écrit dans `gemini_calls`. La file d'attente avance toute seule, minute par minute, avec **respect strict de la sliding window**.
5. Le workflow attend ce délai (`Wait` node) puis appelle Gemini.
6. **Aucun fallback en mode normal** : `GEMINI_MAX_WAIT_SECONDS=1800` par défaut autorise jusqu'à 30 min de file d'attente, soit ~150 sujets simultanés à 5 RPM. Le garde-fou ne se déclenche qu'en cas de bug ou de table corrompue.

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
| `GET` | `/api/topics/:slug/same-day-urls?date=YYYY-MM-DD` | — | URLs du jour pour anti-doublon n8n. |
| `POST` | `/api/posts` | `x-blog-secret` | Publication d'un récap (n8n). Filtre les doublons du jour. |
| `POST` | `/api/gemini/reserve` | `x-blog-secret` | Réservation de slot Gemini. |
| `PUT` | `/api/topics` | `x-blog-secret` | Crée / met à jour un sujet (mode, label, description). |

## SEO

Mis en place côté serveur :

- **Rendu HTML serveur** sur la home, la page sujet, la page recap (lisible sans JavaScript).
- **Métadonnées par page** : `<title>`, `<meta description>`, `<link rel=canonical>`.
- **OpenGraph** + **Twitter Card** (`og:type`, `og:image`, `twitter:card`...).
- **JSON-LD** :
  - `WebSite` + `SearchAction` sur la home.
  - `CollectionPage` + `ItemList` + `BreadcrumbList` sur la page sujet.
  - `NewsArticle` + `BreadcrumbList` + `citation[]` sur chaque recap.
- **Sitemap index** (`/sitemap.xml`) qui agrège un sitemap par sujet (`/sitemap-<slug>.xml`).
- **`robots.txt`** explicite, `Cache-Control` adapté à chaque type de contenu.
- **RSS 2.0** par sujet.

À configurer côté infra production :

1. `https://patch-notes.fr/sitemap.xml` dans Google Search Console et Bing Webmaster Tools.
2. HTTPS obligatoire (Caddy / Nginx / Cloudflare devant le port 3001).
3. Une vraie image de partage (`SITE_OG_IMAGE`) en 1200x630 dans `blog/public/`.

## Déploiement

VPS Docker (le plus simple) :

1. Pointer `patch-notes.fr` vers le VPS.
2. `git clone` du repo.
3. `cp .env.example .env` puis remplir.
4. `docker compose up -d --build`.
5. Reverse proxy (Caddy ou Nginx) :
   - `patch-notes.fr` → `http://localhost:3001` (blog).
   - `n8n.patch-notes.fr` → `http://localhost:5678` (n8n, idéalement protégé).
6. Vérifie le healthcheck du blog : `curl https://patch-notes.fr/health`.

Mise à jour :

```powershell
git pull
docker compose up -d --build
```

Les migrations de schéma sont idempotentes (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Aucune action manuelle nécessaire.
