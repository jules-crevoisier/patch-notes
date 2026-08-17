# SEO — image OG et Google Search Console

## C’est quoi l’image OG ?

**OG** = **Open Graph**, un standard créé pour Facebook et repris partout (X/Twitter, Discord, Slack, LinkedIn, iMessage…).

Quand quelqu’un colle un lien vers ton site, l’app va lire les balises `<meta property="og:…">` dans le HTML. L’**image OG** (`og:image`) est la **vignette grande format** affichée au-dessus du titre et de la description.

Sans image dédiée, les réseaux affichent souvent :
- un favicon minuscule, ou
- une image aléatoire de la page, ou
- rien du tout.

Avec une bonne image OG (1200×630 px, lisible, cohérente avec la marque), chaque partage devient une **carte visuelle** qui donne envie de cliquer — et Google peut aussi s’en servir dans certains extraits enrichis.

Sur patch-notes.fr, l’image par défaut est `blog/public/og.jpg`, référencée par :

```env
SITE_OG_IMAGE=https://patch-notes.fr/og.jpg
```

Les pages SSR injectent aussi `og:image:width`, `og:image:height` et `og:image:alt`.

---

## Vérifier l’image OG en local

1. L’image doit répondre : `http://localhost:3001/og.jpg`
2. Ouvre une page recap ou `/actu/` et cherche dans le code source :

```html
<meta property="og:image" content="http://localhost:3001/og.jpg" />
```

3. Outils en ligne (après déploiement HTTPS) :
   - [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
   - [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
   - [opengraph.xyz](https://www.opengraph.xyz/)

---

## Google Search Console — étape par étape

Search Console est l’outil **gratuit** de Google pour :
- prouver que tu possèdes le domaine,
- soumettre le sitemap,
- voir quelles pages sont indexées,
- repérer les erreurs d’exploration.

### 1. Créer la propriété

1. Va sur [Google Search Console](https://search.google.com/search-console).
2. **Ajouter une propriété** → choisis **Domaine** (`patch-notes.fr`) ou **Préfixe d’URL** (`https://patch-notes.fr/`).
   - **Préfixe d’URL** est plus simple pour commencer.

### 2. Valider la propriété (balise HTML)

1. Google te propose plusieurs méthodes → choisis **Balise HTML**.
2. Tu obtiens un code du type : `AbCdEf1234567890…`
3. Colle-le dans ton `.env` production :

```env
GOOGLE_SITE_VERIFICATION=AbCdEf1234567890…
```

4. Redéploie le blog (`docker compose up -d --build`).
5. Vérifie que la balise apparaît sur la home :

```html
<meta name="google-site-verification" content="AbCdEf1234567890…" />
```

6. Retourne dans Search Console → **Valider**.

> Alternative : enregistrement DNS TXT (plus propre à long terme si tu changes de serveur), mais la balise HTML suffit.

### 3. Soumettre le sitemap

1. Search Console → **Sitemaps** (menu gauche).
2. Ajoute : `https://patch-notes.fr/sitemap.xml`
3. Google va crawler :
   - `sitemap-core.xml` (home, sujets, pages légales),
   - un sitemap par sujet avec **pages `/actu/`** + recaps.

### 4. Surveiller l’indexation

Dans les jours suivants, consulte :

| Rapport | Utilité |
|---------|---------|
| **Pages** | URLs indexées / non indexées |
| **Performances** | requêtes Google, clics, position moyenne |
| **Couverture / Indexation** | erreurs 404, redirections, pages bloquées |

Priorité pour ton objectif SEO : filtrer les URLs `/actu/` et vérifier qu’elles passent en **Indexées**.

### 5. Bing (optionnel mais rapide)

[M Bing Webmaster Tools](https://www.bing.com/webmasters) — importe depuis Google Search Console en un clic, soumets le même sitemap.

---

## Checklist production

- [ ] `SITE_URL=https://patch-notes.fr` (HTTPS, sans slash final)
- [ ] `SITE_OG_IMAGE=https://patch-notes.fr/og.jpg`
- [ ] `GOOGLE_SITE_VERIFICATION=…` renseigné et validé
- [ ] Sitemap soumis : `https://patch-notes.fr/sitemap.xml`
- [ ] Test partage sur Discord / X avec un lien recap ou `/actu/`
