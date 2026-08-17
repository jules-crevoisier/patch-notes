# Déploiement sur Dokploy

Guide pas à pas pour héberger **patch-notes.fr** sur [Dokploy](https://dokploy.com) avec déploiement automatique depuis GitHub.

## Architecture

```
GitHub (push) → Dokploy (build + deploy) → Traefik (HTTPS)
                              │
                    ┌─────────┴─────────┐
                    │  blog :3001       │
                    │  SSR + cron 4x/j  │
                    └─────────┬─────────┘
                              │ Prisma
                    ┌─────────┴─────────┐
                    │  postgres:16      │
                    │  volume persistant│
                    └───────────────────┘
```

- **Postgres** : volume `postgres_data` (ne pas supprimer en prod).
- **Blog** : migrations Prisma au boot, scheduler cron interne (6h, 11h, 18h, 23h Paris).
- **Scroll infini** : page sujet SSR (8 premiers recaps) + `app.js` charge la suite via `/api/topics/:slug/posts`.

---

## Prérequis

1. Un serveur avec **Dokploy** installé (VPS Hetzner, OVH, etc.).
2. Le repo GitHub : `https://github.com/jules-crevoisier/patch-notes`
3. Un domaine (ex. `patch-notes.fr`) dont le **DNS A** pointe vers l’IP du serveur Dokploy.
4. Une clé **Gemini API** (Google AI Studio).

---

## Étape 1 — Pousser le code sur GitHub

Sur ta machine (branche `feature/replace-n8n` ou `main` après merge) :

```powershell
git status
git push -u origin feature/replace-n8n
```

Tu peux aussi merger la PR vers `main` et déployer `main` dans Dokploy.

---

## Étape 2 — Créer le projet dans Dokploy

1. Ouvre le dashboard Dokploy.
2. **Create Project** → nom : `patch-notes`.
3. **Add Service** → type **Docker Compose**.
4. **Source** :
   - Provider : **GitHub**
   - Repository : `jules-crevoisier/patch-notes`
   - Branch : `main` (ou `feature/replace-n8n`)
   - **Compose path** : `docker-compose.dokploy.yml`
5. Active **Auto Deploy** (webhook GitHub) pour redéployer à chaque push.

---

## Étape 3 — Variables d’environnement

Dans Dokploy → service → **Environment**, colle (puis adapte les secrets) :

```env
POSTGRES_USER=patchnotes
POSTGRES_PASSWORD=<openssl rand -base64 24>
POSTGRES_DB=patch_notes
DATABASE_POOL_SIZE=10

BLOG_SECRET=<openssl rand -hex 32>
IP_HASH_SECRET=<openssl rand -hex 32>

SITE_URL=https://patch-notes.fr
SITE_NAME=patch-notes.fr
SITE_DESCRIPTION=Hub d'actualité par sujet : récaps courts, sources et liens utiles, mis à jour plusieurs fois par jour.
SITE_LOCALE=fr_FR
SITE_OG_IMAGE=https://patch-notes.fr/og.jpg
GOOGLE_SITE_VERIFICATION=8UTKzC1D5bsLZwp_S3zhY1zgkeKghuh71S08xP-A6kA

TZ=Europe/Paris

GEMINI_API_KEY=<ta clé Google AI Studio>
GEMINI_MODEL=gemini-flash-latest
GEMINI_MAX_PER_MINUTE=5
GEMINI_MAX_WAIT_SECONDS=1800
```

Génération des secrets (PowerShell avec OpenSSL ou Git Bash) :

```bash
openssl rand -hex 32      # BLOG_SECRET, IP_HASH_SECRET
openssl rand -base64 24   # POSTGRES_PASSWORD
```

> Ne commite **jamais** le fichier `.env` local — il reste ignoré par git.

---

## Étape 4 — Domaine et HTTPS

1. Dokploy → service **blog** → onglet **Domains**.
2. Ajoute `patch-notes.fr` (et `www.patch-notes.fr` si besoin).
3. Port conteneur : **3001**.
4. Active **HTTPS** (Let’s Encrypt via Traefik intégré à Dokploy).
5. Sauvegarde et **Deploy**.

---

## Étape 5 — Premier déploiement

1. Clique **Deploy** (ou laisse le webhook GitHub le faire).
2. Attends la fin du build Docker (~2–5 min la première fois).
3. Vérifie les logs du service `blog` :
   - `prisma migrate deploy` doit passer sans erreur.
   - `[scheduler] registered 4 cron jobs` (ou équivalent).

Tests :

```bash
curl -s https://patch-notes.fr/health
# → {"ok":true}

curl -I https://patch-notes.fr/sitemap.xml
curl -I https://patch-notes.fr/esport
```

---

## Étape 6 — Ajouter un sujet via GitHub (workflow autonome)

1. **En local**, crée le fichier de config :

```powershell
node blog/automation/topics/new.js crypto "Crypto" "Bitcoin, Ethereum, régulation, DeFi." fr-intl
```

2. Édite `blog/automation/topics/configs/crypto.js` (sources RSS, mots-clés).

3. Commit + push :

```powershell
git add blog/automation/topics/configs/crypto.js
git commit -m "add | sujet crypto"
git push
```

4. Dokploy **rebuild + redémarre** le conteneur → le scheduler recharge les sujets au boot.

Routes créées automatiquement :

- `https://patch-notes.fr/crypto`
- `https://patch-notes.fr/crypto/feed.xml`
- `https://patch-notes.fr/sitemap-crypto.xml`

Guide détaillé : [`docs/topics-guide.md`](docs/topics-guide.md).

---

## Étape 7 — Sauvegardes Postgres (recommandé)

Le volume `postgres_data` survit aux redeploys, mais pas à une suppression de volume.

**Option A — Cron sur le serveur** (SSH) :

```bash
# crontab -e
15 4 * * * cd /path/to/dokploy/compose && docker compose -f docker-compose.dokploy.yml exec -T postgres pg_dump -U patchnotes -d patch_notes | gzip -9 > /backups/patch_notes-$(date +\%Y\%m\%d).sql.gz
```

**Option B — Backup Dokploy** si ton instance expose des snapshots de volumes.

Script local (VPS classique) : [`scripts/backup.sh`](scripts/backup.sh).

---

## Mise à jour en production

| Action | Effet |
| --- | --- |
| Push GitHub (auto deploy ON) | Rebuild + migrations + restart scheduler |
| Changer une variable env | Redeploy manuel dans Dokploy |
| Nouveau sujet (fichier config) | Push → redeploy (restart blog) |

Les migrations Prisma s’appliquent seules au démarrage du conteneur `blog`.

---

## Dépannage

| Symptôme | Piste |
| --- | --- |
| `502` / site down | Logs service `blog` ; vérifier `/health` |
| Migrations échouent | Logs `prisma migrate deploy` ; ne pas supprimer le volume postgres sans backup |
| Pas de nouveaux recaps | `GEMINI_API_KEY` valide ; quota RPM ; logs `[scheduler]` |
| Sujet absent après push | Fichier dans `blog/automation/topics/configs/` ; redeploy complet (restart) |
| Scroll infini bloqué | Console navigateur ; API `/api/topics/<slug>/posts?offset=8&limit=8` |

---

## Différence VPS Apache vs Dokploy

| | VPS + Apache (`DEPLOY.md`) | Dokploy |
| --- | --- | --- |
| Compose | `docker-compose.yml` + `docker-compose.prod.yml` | `docker-compose.dokploy.yml` |
| HTTPS | Certbot + Apache | Traefik Dokploy |
| Port blog | `127.0.0.1:3001` | exposé en interne, routé par Traefik |

Les deux cibles partagent le même code et la même base Postgres.
