# Guide pratique — sources et topics

Ce guide t'explique **comment ajouter un nouveau sujet de qualité** au hub patch-notes.fr, étape par étape, avec des exemples concrets.

> Tout ce que tu modifies se trouve dans **un seul nœud n8n** : `📝 Configurer le sujet` du workflow dupliqué. Aucune autre modification n'est nécessaire.

---

## 1. Choisir le slug et le label

| Champ | Règles | Exemples |
| --- | --- | --- |
| `slug` | minuscules, chiffres, tirets uniquement. Devient l'URL `/<slug>`. Court (≤ 18 caractères). | `esport`, `tech-ia`, `cinema-series`, `f1` |
| `label` | nom humain affiché dans les titres et le hub. Avec accents, espaces, slash autorisés. | `Esport`, `Tech / IA`, `Cinéma & Séries`, `F1` |
| `description` | une phrase ≤ 120 caractères qui résume l'angle éditorial. | `Sorties, mises à jour majeures et signaux de fond du jeu vidéo.` |

Le slug est définitif (les anciens recaps gardent leur URL). Le label et la description peuvent évoluer.

---

## 2. Choisir le mode de couverture

Trois choix possibles dans `mode`. Le filtre s'applique automatiquement aux sources : tu peux laisser **toutes** les sources dans le tableau, celles de l'autre région sont juste ignorées.

| Mode | Cas d'usage | Exemples de sujets |
| --- | --- | --- |
| `'fr'` | actu très française, ancrée localement | politique FR, sport FR (Ligue 1, Top 14), mercato français, vie politique, justice |
| `'intl'` | actu mondiale en anglais, sources US/UK | tech US (OpenAI, Apple), Hollywood, espace (NASA/SpaceX), géopolitique anglo |
| `'fr-intl'` *(défaut)* | tu veux les deux angles côté à côté | esport, gaming, cinéma, science, sport mondial, IA |

Le rendu visuel s'adapte tout seul :
- `'fr'` ou `'intl'` → une seule colonne **Articles**.
- `'fr-intl'` → deux colonnes **France / International** quand les deux ont des articles.

---

## 3. Trouver de bonnes sources

### 3.1 Méthode RSS (préférée, plus propre)

Toujours préférer un flux RSS direct quand le site en publie un. C'est moins bruité, plus rapide et plus stable que Google News.

**Comment trouver le flux RSS d'un site :**

1. Ouvre la page d'accueil du site, fais clic-droit → **Voir le code source** (ou `Ctrl+U`).
2. Cherche `application/rss+xml` ou `application/atom+xml` dans le HTML. Ex. :
   ```html
   <link rel="alternate" type="application/rss+xml" href="https://www.numerama.com/feed/">
   ```
3. Si rien, essaie ces patterns dans la barre d'adresse :
   - `<site>/feed`
   - `<site>/rss`
   - `<site>/feed.xml`
   - `<site>/rss.xml`
   - `<site>/atom.xml`
   - `<site>/feed/`
4. WordPress publie quasi toujours un RSS sur `/feed/`. Substack aussi.
5. En dernier recours : [feedspot.com](https://www.feedspot.com/) ou [rss.app](https://rss.app/) listent des flux par thématique.

**Exemple de configuration RSS :**

```js
{ name: 'Numerama',  region: 'fr',   method: 'rss', url: 'https://www.numerama.com/feed/',          max: 6 },
{ name: 'The Verge', region: 'intl', method: 'rss', url: 'https://www.theverge.com/rss/index.xml',  max: 6 },
```

`max` = nombre maximum d'articles à conserver pour cette source par run. Mets entre **4 et 8**. Plus, c'est du bruit ; moins, et tu manques d'angles.

### 3.2 Méthode Google News (si pas de RSS public)

Quand un site n'a pas de RSS exposé, on passe par Google News qui propose un RSS de recherche par site + mots-clés. Le workflow construit l'URL automatiquement.

**Configuration :**

```js
{ name: 'Mandatory.gg', region: 'fr', method: 'google', siteDomain: 'mandatory.gg', max: 5 },
{ name: 'Win.gg',       region: 'intl', method: 'google', siteDomain: 'win.gg',       max: 4 },
```

L'URL Google News est calculée comme :
```
https://news.google.com/rss/search?q=site:<siteDomain>+<searchTerms>+...&hl=fr&gl=FR&ceid=FR:fr
```

Les `searchTerms` du sujet servent à filtrer ce qui sort du domaine. C'est ce qui distingue *un article esport sur Mandatory.gg* d'*un guide Fortnite*.

### 3.3 Combien de sources mettre ?

Recommandation pour un sujet sain :

- Mode `fr-intl` → **3 à 5 sources FR** + **4 à 7 sources INT**.
- Mode `fr` ou `intl` → **5 à 10 sources** dans la région choisie.

Privilégie la diversité éditoriale (un grand média + un spécialisé + un blog de niche) plutôt que de cumuler des médias très similaires (qui republieront les mêmes dépêches).

### 3.4 Sources à éviter

- Sites de **guides / soluces / promos** : ils saturent les recaps de contenus pratiques inutiles.
- Sites avec **flux RSS qui republient tout l'historique** à chaque update : font remonter de vieux articles.
- **Aggrégateurs sans rédaction propre** (sauf Google News, intentionnel).
- Sites derrière **paywall complet** : le titre et le snippet seuls ne suffisent pas à un lecteur.

---

## 4. Définir les mots-clés

C'est ce qui fait la **précision éditoriale** d'un sujet. Trois listes :

### 4.1 `searchTerms`

Utilisé uniquement pour les sources `method: 'google'`. Une chaîne de 5 à 15 mots-clés majeurs séparés par `OR`. Précise, pas trop large.

```js
searchTerms: '(IA OR "intelligence artificielle" OR ChatGPT OR Gemini OR Claude OR cybersécurité OR cloud OR LLM OR OpenAI)'
```

Astuces :
- Mets entre guillemets les expressions à plusieurs mots : `"esports world cup"`, `"intelligence artificielle"`.
- 5-10 termes max, sinon Google News dilue trop la pertinence.
- Pas besoin d'être exhaustif ici, le filtre `positiveKeywords` complète.

### 4.2 `positiveKeywords` (filtre **obligatoire**)

Tableau de termes : un article doit en contenir **au moins un** dans son titre + snippet pour être retenu. Permets de garder seulement ce qui parle vraiment de ton sujet.

```js
positiveKeywords: [
  'ia', 'intelligence artificielle', 'chatgpt', 'openai', 'gemini', 'claude',
  'anthropic', 'mistral', 'meta llama', 'nvidia', 'cloud',
  'cybersecurite', 'cybersécurité', 'startup', 'saas', 'llm',
  'modele', 'modèle', 'puce ia', 'data center'
]
```

Règles :
- **Tout en minuscules**, sans accents normalisés (le filtre est insensible à la casse mais pas aux accents — donc inclus les deux variantes : `cybersécurité` ET `cybersecurite`).
- Mets les **noms propres** (entreprises, produits, équipes, jeux, événements) que tu veux suivre.
- 15 à 40 termes est un bon ordre de grandeur.

### 4.3 `negativeKeywords` (filtre **éliminatoire**)

Termes qui éliminent immédiatement un article, même s'il matche un positive. Prioritaire sur le positive.

```js
negativeKeywords: [
  'bon plan', 'promo', 'code promo', 'black friday', 'soldes', 'deal',
  'comparatif', "guide d'achat", 'meilleur prix', 'test complet',
  'tier list', 'cheat', 'astuce'
]
```

Cible :
- Contenus commerciaux (deals, promos).
- Guides, tutos, soluces, walkthroughs.
- Contenus people / drama / clickbait.
- Programmes TV génériques, horoscopes.

### 4.4 `editorialHints`

Texte libre injecté dans le prompt Gemini en plus des consignes globales. Sert à guider le ton ou éviter les pièges spécifiques à ton domaine.

```js
editorialHints: [
  "- Priorise IA, plateformes, cybersécurité, régulation et usages grand public.",
  "- Reste prudent sur les annonces de modèles : précise toujours s'il s'agit d'une bêta, d'un teaser ou d'une mise en production."
].join('\n')
```

Une ligne par règle. Style impératif court. Maximum 5-6 lignes.

---

## 5. Régler les caps et l'âge max

```js
maxAgeDays: { google: 3, rss: 7 },
caps:       { fr: 14, intl: 18, total: 36 }
```

| Réglage | Quand augmenter | Quand diminuer |
| --- | --- | --- |
| `maxAgeDays.google` | sujet à actu lente (science, cinéma) | sujet à très haute fréquence (esport, F1) |
| `maxAgeDays.rss` | idem, et si certains flux datent leurs articles bizarrement | rare, garde 7 jours par défaut |
| `caps.fr` / `caps.intl` | tu veux des recaps très denses (lecteurs experts) | tu veux des recaps plus courts (grand public) |
| `caps.total` | corollaire | corollaire |

Bon défaut : `{ google: 3, rss: 7 }` et `{ fr: 14, intl: 18, total: 36 }`.

---

## 6. Tester un nouveau sujet

Une fois ton `TOPIC` modifié dans le nœud config, dans n8n :

1. Clique **« Test workflow »** en bas du canvas.
2. Vérifie les sorties node par node :

   | Nœud | Ce que tu dois voir |
   | --- | --- |
   | `Configurer le sujet` | un seul item avec `topic`, `sources`, `gemini`, `blog`. Vérifie que `topic.mode` et `sources` sont corrects. |
   | `Charger URLs déjà publiées` | `{ urls: [...] }` (peut être vide). |
   | `Préparer les sources` | un item par source ; `mode: 'fr'` doit en avoir filtré. |
   | `Télécharger les flux` | tous les items ont une réponse non vide. Erreur HTTP 4xx → flux invalide. |
   | `Assembler recap` | `postBase.articles.length > 0` si tes sources sont bonnes ; `errors[]` court ou vide. |
   | `Réserver slot Gemini` | `{ ok: true, waitMs: 0 }` à vide, ou un délai cohérent si d'autres sujets tournent. |
   | `Générer le mini recap` | réponse Gemini avec un JSON `{title, summary}` parsable. |
   | `Publier sur le blog` | code `201` (créé) ou `200` (skipped si tous les articles étaient déjà publiés aujourd'hui). |

3. Si tout est vert : **Active** le workflow. Il tournera ensuite à 06h, 11h, 18h, 23h.

### Symptômes courants et fix

| Symptôme | Cause probable | Fix |
| --- | --- | --- |
| `errors[]` plein de "aucun article retenu" | `positiveKeywords` trop restrictif | élargir, mettre des termes plus génériques |
| `selectedArticlesCount` faible (< 5) | sources trop pauvres ou trop filtrées | ajouter 2-3 sources, alléger `negativeKeywords` |
| Récaps avec articles hors-sujet | `negativeKeywords` insuffisant | ajouter les patterns parasites |
| Tous les articles sont des "deals" | sources mal choisies (bons plans plutôt qu'éditorial) | retirer les flux marketing |
| Gemini renvoie un titre fade et générique | `editorialHints` vide ou trop vague | ajouter 2-3 règles éditoriales précises |

---

## 7. Exemples prêts à coller

### Esport (le sujet par défaut, déjà dans le template)

```js
const TOPIC = {
  slug: 'esport',
  label: 'Esport',
  description: 'Compétitions, rosters, tournois et scènes FR / internationales.',
  mode: 'fr-intl',
  searchTerms: '(esport OR esports OR e-sport OR VCT OR LEC OR LCK OR LFL OR LCS OR EWC OR "Esports World Cup" OR CS2 OR "Counter-Strike" OR BLAST OR IEM OR PGL OR RLCS OR roster OR mercato OR playoffs OR qualifiers)',
  positiveKeywords: ['esport', 'e-sport', 'esports', 'league of legends', 'valorant', 'counter-strike', 'cs2', 'rocket league', 'dota 2', 'lec', 'lck', 'lfl', 'lcs', 'vct', 'rlcs', 'blast', 'iem', 'pgl', 'ewc', 'esports world cup', 'playoffs', 'qualifier', 'tournament', 'tournoi', 'roster', 'mercato', 'team vitality', 'karmine', 'fnatic', 'g2 esports', 'hltv', 'worlds', 'msi'],
  negativeKeywords: ['questline', 'challenges', 'walkthrough', 'loadout', 'tier list', 'patch notes', 'soluce', 'boutique officielle', 'maillot', 't-shirt'],
  maxAgeDays: { google: 3, rss: 7 },
  caps: { fr: 14, intl: 18, total: 36 },
  editorialHints: "- Ne déforme pas le niveau de compétition : qualifier, playoffs, phase de groupes, ligue régionale, tournoi principal restent distincts.",
  sources: [
    { name: 'Mandatory.gg',   region: 'fr',   method: 'google', siteDomain: 'mandatory.gg',  max: 5 },
    { name: 'Millenium',      region: 'fr',   method: 'google', siteDomain: 'millenium.org', max: 5 },
    { name: 'Team-aAa',       region: 'fr',   method: 'rss',    url: 'https://www.team-aaa.com/rss/full.xml', max: 7 },
    { name: 'Breakflip',      region: 'fr',   method: 'google', siteDomain: 'breakflip.com', max: 5 },
    { name: 'Dot Esports',    region: 'intl', method: 'rss',    url: 'https://dotesports.com/feed', max: 6 },
    { name: 'Dexerto Esports',region: 'intl', method: 'rss',    url: 'https://www.dexerto.com/esports/feed/', max: 6 },
    { name: 'Esports Insider',region: 'intl', method: 'rss',    url: 'https://esportsinsider.com/feed', max: 6 },
    { name: 'HLTV',           region: 'intl', method: 'rss',    url: 'https://www.hltv.org/rss/news', max: 4 }
  ]
};
```

### Gaming

```js
const TOPIC = {
  slug: 'gaming',
  label: 'Gaming',
  description: 'Sorties, mises à jour majeures et signaux de fond du jeu vidéo.',
  mode: 'fr-intl',
  searchTerms: '(gaming OR "jeu video" OR "jeu vidéo" OR PlayStation OR "PS5" OR Xbox OR "Game Pass" OR Nintendo OR Switch OR Steam OR trailer OR "date de sortie" OR DLC OR Ubisoft OR EA OR Bethesda OR Rockstar OR FromSoftware OR "State of Play" OR "Nintendo Direct")',
  positiveKeywords: ['playstation', 'ps5', 'xbox', 'game pass', 'nintendo', 'switch', 'steam', 'trailer', 'bande-annonce', 'date de sortie', 'sortie', 'dlc', 'studio', 'ubisoft', 'electronic arts', 'bethesda', 'rockstar', 'capcom', 'sega', 'square enix', 'fromsoftware', 'state of play', 'nintendo direct', 'jeu vidéo', 'jeu video'],
  negativeKeywords: ['guide', 'soluce', 'walkthrough', 'tier list', 'meilleur build', 'where to find', 'how to', 'comment obtenir', 'astuce', 'quete', 'quete'],
  maxAgeDays: { google: 5, rss: 7 },
  caps: { fr: 14, intl: 18, total: 36 },
  editorialHints: "- Priorise annonces, sorties, reports, studios, plateformes, tendances.\n- Ignore guides, soluces, astuces et tier lists.",
  sources: [
    { name: 'Jeuxvideo.com', region: 'fr',   method: 'google', siteDomain: 'jeuxvideo.com', max: 6 },
    { name: 'Gamekult',      region: 'fr',   method: 'google', siteDomain: 'gamekult.com',  max: 5 },
    { name: 'JV Magazine',   region: 'fr',   method: 'rss',    url: 'https://www.jeuxactu.com/rss',          max: 5 },
    { name: 'IGN',           region: 'intl', method: 'rss',    url: 'https://feeds.feedburner.com/ign/all',   max: 6 },
    { name: 'Polygon',       region: 'intl', method: 'rss',    url: 'https://www.polygon.com/rss/index.xml',  max: 6 },
    { name: 'Eurogamer',     region: 'intl', method: 'rss',    url: 'https://www.eurogamer.net/feed',         max: 6 },
    { name: 'Game Informer', region: 'intl', method: 'rss',    url: 'https://www.gameinformer.com/news.xml',  max: 4 }
  ]
};
```

### Tech / IA

```js
const TOPIC = {
  slug: 'tech-ia',
  label: 'Tech / IA',
  description: 'IA, plateformes, produits, régulation et signaux de fond tech.',
  mode: 'fr-intl',
  searchTerms: '(IA OR "intelligence artificielle" OR ChatGPT OR OpenAI OR Gemini OR Claude OR Anthropic OR Mistral OR Llama OR cybersécurité OR cloud OR LLM OR Nvidia OR "data center" OR startup)',
  positiveKeywords: ['ia', 'intelligence artificielle', 'ai', 'openai', 'chatgpt', 'gemini', 'anthropic', 'claude', 'mistral', 'llama', 'nvidia', 'cybersecurite', 'cybersécurité', 'cloud', 'saas', 'llm', 'modele', 'modèle', 'startup', 'régulation', 'regulation', 'puce', 'chip', 'data center'],
  negativeKeywords: ['bon plan', 'promo', 'code promo', 'black friday', 'soldes', 'deal', 'comparatif', "guide d'achat", 'meilleur prix', 'test complet', 'wallpaper'],
  maxAgeDays: { google: 4, rss: 7 },
  caps: { fr: 14, intl: 18, total: 36 },
  editorialHints: "- Priorise IA, plateformes, cybersécurité, entreprises tech, régulation et usages grand public.\n- Évite les bons plans et tests produits trop commerciaux.",
  sources: [
    { name: 'Numerama',     region: 'fr',   method: 'rss',    url: 'https://www.numerama.com/feed/',         max: 6 },
    { name: 'Le Monde Tech',region: 'fr',   method: 'rss',    url: 'https://www.lemonde.fr/pixels/rss_full.xml', max: 5 },
    { name: 'Frandroid',    region: 'fr',   method: 'rss',    url: 'https://www.frandroid.com/feed',         max: 5 },
    { name: 'The Verge',    region: 'intl', method: 'rss',    url: 'https://www.theverge.com/rss/index.xml', max: 6 },
    { name: 'Ars Technica', region: 'intl', method: 'rss',    url: 'https://feeds.arstechnica.com/arstechnica/index', max: 5 },
    { name: 'TechCrunch',   region: 'intl', method: 'rss',    url: 'https://techcrunch.com/feed/',           max: 6 },
    { name: 'MIT Tech Rev.',region: 'intl', method: 'rss',    url: 'https://www.technologyreview.com/feed/', max: 4 }
  ]
};
```

### Cinéma / Séries (FR + INT)

```js
const TOPIC = {
  slug: 'cinema-series',
  label: 'Cinéma & Séries',
  description: 'Sorties, plateformes, casting, festivals et décisions de production.',
  mode: 'fr-intl',
  searchTerms: '(cinéma OR film OR série OR Netflix OR "Disney+" OR "Prime Video" OR HBO OR Max OR "Apple TV" OR "box-office" OR trailer OR "bande-annonce" OR Cannes OR Oscar)',
  positiveKeywords: ['cinema', 'cinéma', 'film', 'serie', 'série', 'series', 'netflix', 'disney+', 'prime video', 'hbo', 'max', 'apple tv', 'canal+', 'box-office', 'trailer', 'bande-annonce', 'casting', 'realisateur', 'réalisateur', 'cannes', 'oscar', 'emmy', 'sortie', 'saison', 'renouvele', 'renouvelé', 'annule', 'annulé'],
  negativeKeywords: ['programme tv', 'horoscope', 'top 10 netflix', 'fin expliquee', 'fin expliquée', 'streaming gratuit', 'illegal', 'illégal', 'telecharger', 'télécharger'],
  maxAgeDays: { google: 5, rss: 7 },
  caps: { fr: 14, intl: 18, total: 36 },
  editorialHints: "- Priorise sorties, annonces plateformes, casting, box-office, festivals et décisions de production.\n- Ignore programmes TV génériques et explications de fins.",
  sources: [
    { name: 'AlloCiné',      region: 'fr',   method: 'rss',    url: 'http://rss.allocine.fr/ac/cine/cettesemaine',     max: 5 },
    { name: 'Première',      region: 'fr',   method: 'rss',    url: 'https://www.premiere.fr/rss',                      max: 5 },
    { name: 'Variety',       region: 'intl', method: 'rss',    url: 'https://variety.com/feed/',                        max: 6 },
    { name: 'Hollywood Rep.',region: 'intl', method: 'rss',    url: 'https://www.hollywoodreporter.com/feed',           max: 5 },
    { name: 'Deadline',      region: 'intl', method: 'rss',    url: 'https://deadline.com/feed/',                       max: 5 }
  ]
};
```

### F1 (uniquement FR)

```js
const TOPIC = {
  slug: 'f1',
  label: 'Formule 1',
  description: 'Grands prix, écuries, pilotes, qualifications et marché des transferts.',
  mode: 'fr',
  searchTerms: '(F1 OR "Formule 1" OR Ferrari OR Mercedes OR "Red Bull" OR McLaren OR Verstappen OR Leclerc OR Hamilton OR Norris OR "grand prix" OR pole OR podium)',
  positiveKeywords: ['f1', 'formule 1', 'grand prix', 'pole', 'podium', 'qualifications', 'écurie', 'ecurie', 'pilote', 'verstappen', 'leclerc', 'hamilton', 'norris', 'sainz', 'russell', 'alonso', 'ferrari', 'mercedes', 'red bull', 'mclaren', 'aston martin'],
  negativeKeywords: ['pronostic', 'cote ', 'cotes ', 'paris sportifs', 'streaming gratuit', 'programme tv', 'jeu video', 'jeu vidéo', 'simulateur'],
  maxAgeDays: { google: 4, rss: 7 },
  caps: { fr: 20, intl: 0, total: 20 },
  editorialHints: "- Priorise résultats GP, qualifs, déclarations pilote / team principal, contrats, sanctions FIA.",
  sources: [
    { name: 'Auto Hebdo',    region: 'fr', method: 'rss',    url: 'https://www.autohebdo.fr/rss/sport.xml',         max: 5 },
    { name: 'Motorsport.com FR', region: 'fr', method: 'rss',url: 'https://fr.motorsport.com/rss/f1/news/',          max: 6 },
    { name: 'L\'Equipe F1',  region: 'fr', method: 'google', siteDomain: 'lequipe.fr',                              max: 5 },
    { name: 'Nextgen-Auto',  region: 'fr', method: 'google', siteDomain: 'nextgen-auto.com',                        max: 4 }
  ]
};
```

---

## 8. Comportement Gemini avec plusieurs sujets

Tous tes sujets se déclenchent aux mêmes horaires (06h, 11h, 18h, 23h). Pour respecter le quota Gemini, le blog joue le rôle d'un **distributeur de tickets** :

| Quota = 5 RPM | Topic 1-5 | Topic 6-10 | Topic 11-15 | Topic 16-20 |
| --- | --- | --- | --- | --- |
| Attente avant Gemini | 0 s | ~60 s | ~120 s | ~180 s |
| Récap publié | T+0 | T+1 min | T+2 min | T+3 min |

Avec 30 sujets et 5 RPM, le dernier publie ~6 minutes après le déclenchement. Tous passent par Gemini, **aucun ne tombe en fallback**.

Si tu veux accélérer : passe à un plan Gemini payant (250 RPM sur Tier 1) puis monte `GEMINI_MAX_PER_MINUTE` dans `.env`. Aucun changement à faire dans les workflows.
