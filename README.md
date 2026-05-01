# patch-notes.fr

Hub de veille par sujet. Le site expose des pages comme `/esport`, puis n8n collecte les sources, filtre les doublons du jour, génère un mini-récap avec Gemini si une clé est disponible, et publie sur l'API du blog.

## Architecture

- `blog/` : serveur Node sans framework, pages publiques, API de publication, sitemap, robots.txt et flux RSS.
- `n8n-workflows/` : workflow n8n importable et code des nodes principaux.
- `docker-compose.yml` : n8n + Postgres pour l'automatisation locale ou serveur.
- `blog/data/posts.json` : stockage local des posts en dev, ignoré par Git.

## Lancer en local

```powershell
Copy-Item .env.example .env
docker compose up -d
cd blog
npm start
```

URLs locales:

- Blog: `http://localhost:3001`
- Sujet esport: `http://localhost:3001/esport`
- n8n: `http://localhost:5678`
- Sitemap: `http://localhost:3001/sitemap.xml`
- RSS esport: `http://localhost:3001/esport/feed.xml`

## Configurer les secrets

Ne jamais commiter `.env`.

Variables importantes:

- `BLOG_SECRET` : secret partagé entre n8n et l'API du blog.
- `GEMINI_API_KEY` : clé Google Gemini, optionnelle.
- `GEMINI_MODEL` : modèle utilisé, par défaut `gemini-2.5-flash`.
- `SITE_URL` : URL publique du site, par exemple `https://patch-notes.fr`.
- `N8N_ENCRYPTION_KEY` : clé stable pour chiffrer les credentials n8n.
- `N8N_PROXY_HOPS` : mettre `1` quand n8n est derrière Apache, Nginx ou Caddy.

## Ajouter un sujet

Le workflow est pensé pour être dupliqué dans n8n.

Dans le node `Preparer les sources`, changer uniquement le bloc `TOPIC` et la liste `sources`:

```js
const TOPIC = {
  slug: 'tech',
  label: 'Tech',
  searchTerms: '(IA OR startup OR cloud OR cybersecurite OR SaaS)',
};

const sources = [
  { name: 'Numerama', region: 'fr', method: 'google', url: siteSearch('numerama.com'), max: 6 },
  { name: 'The Verge', region: 'intl', method: 'rss', url: 'https://www.theverge.com/rss/index.xml', max: 6 },
];
```

Le blog créera ensuite automatiquement les routes:

- `/tech`
- `/tech/recap/{id}`
- `/tech/feed.xml`

## Anti-doublons

Avant d'appeler Gemini, n8n charge `posts.json`, récupère les URLs déjà publiées le même jour, puis retire ces articles de la liste. Gemini ne reçoit donc que les liens réellement publiables.

Si aucun nouvel article n'est disponible:

- Gemini n'est pas appelé;
- le blog ne publie pas de post vide;
- l'API répond `skipped`.

## Créneaux

Le workflow ajoute un libellé selon l'heure:

- `Dans la nuit` avant 8h
- `Matinal` avant 13h
- `Cet aprem` avant 21h
- `Soir` après 21h

La page sujet groupe aussi les récaps par jour.

## SEO

Déjà inclus:

- URLs propres par sujet et par récap.
- `robots.txt`.
- `sitemap.xml`.
- flux RSS par sujet.
- pages légales.
- canonical et description sur la page sujet.

À faire avant production sérieuse:

- rendu HTML serveur pour chaque récap, afin que le contenu soit lisible sans JavaScript;
- JSON-LD `Article` ou `NewsArticle`;
- titres et descriptions uniques par page;
- maillage interne entre sujets;
- ajout de `https://patch-notes.fr/sitemap.xml` dans Google Search Console.

Références utiles:

- Google SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google Sitemaps: https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
- Données structurées Google: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data

## Déploiement recommandé

Le plus simple pour cette version est un VPS avec Docker:

1. Pointer `patch-notes.fr` vers le VPS.
2. Installer Docker et Docker Compose.
3. Lancer Postgres + n8n avec `docker compose up -d`.
4. Lancer le blog Node derrière un reverse proxy.
5. Mettre Caddy ou Nginx devant:
   - `patch-notes.fr` vers le blog;
   - `n8n.patch-notes.fr` vers n8n, idéalement protégé.

Pourquoi ce choix:

- n8n tourne en continu;
- Postgres persiste les workflows;
- le blog peut recevoir les posts via API;
- les fichiers et données restent sous contrôle.

## Netlify ou Cloudflare ?

Possible, mais pas avec cette architecture exactement.

Netlify:

- bon pour héberger le frontend;
- propose des Scheduled Functions, mais elles ont des limites de temps et ne remplacent pas directement n8n;
- il faut un stockage externe pour les posts.

Cloudflare:

- bon choix si on réécrit le blog en Workers/Pages Functions;
- stockage possible via D1, KV ou R2;
- n8n doit rester séparé, ou être remplacé par des Cron Triggers Workers.

Option hybride propre:

- Cloudflare Pages/Workers pour le site public;
- D1 pour les posts;
- n8n hébergé ailleurs qui publie via une API Cloudflare Worker.

Pour avancer vite: VPS Docker maintenant. Pour scaler proprement plus tard: Cloudflare Workers + D1.
