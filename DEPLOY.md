# Déploiement serveur — patch-notes.fr

Guide pas-à-pas pour mettre la stack complète (blog SSR + scheduler cron interne + Postgres) sur un **VPS Debian** où **Apache** sert de reverse proxy. Tout est conçu pour être **idempotent** : tu peux relancer les commandes sans casser l'existant.

---

## 1. Architecture en prod

```
                Internet
                   │
                   ▼  443 / 80
        ┌──────────────────────┐
        │  Apache 2 (host VPS) │   ← seul service exposé sur Internet
        │  + mod_ssl + Certbot │
        └──────────┬───────────┘
                   │ ProxyPass via 127.0.0.1
                   ▼
             patch-notes.fr
             127.0.0.1:3001
              (blog SSR + cron)
                   │
                   ▼
              postgres:5432
        (réseau Docker uniquement,
         invisible depuis l'hôte)
```

Apache fait le TLS (Let's Encrypt via Certbot, renouvellement auto), le proxy HTTP et applique les headers de sécurité. Les conteneurs Docker n'écoutent que sur la loopback `127.0.0.1` : impossible de les atteindre depuis Internet, même si on essaie.

---

## 2. Prérequis serveur (une seule fois)

VPS Debian 12+ (ou Ubuntu LTS) avec **1 GB RAM minimum** (2 GB recommandé).

```bash
# DNS (à faire AVANT le premier déploiement, sinon Let's Encrypt échoue)
#   A     patch-notes.fr        → IP du serveur
#   A     www.patch-notes.fr    → IP du serveur
# (ajouter aussi les AAAA si IPv6)

# 1) Apache + modules
sudo apt update
sudo apt install -y apache2 certbot python3-certbot-apache
sudo a2enmod proxy proxy_http headers deflate rewrite ssl remoteip
sudo systemctl enable --now apache2

# 2) Pare-feu (laisser passer Apache, fermer le reste sauf SSH)
sudo ufw allow OpenSSH
sudo ufw allow 'Apache Full'
sudo ufw enable

# 3) Docker Engine + Compose v2
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version  # doit afficher v2.24+
```

---

## 3. Premier déploiement

### 3.1 Cloner le repo et configurer l'env

```bash
sudo mkdir -p /opt/patch-notes && sudo chown $USER:$USER /opt/patch-notes
git clone https://github.com/<toi>/patch-notes.git /opt/patch-notes
cd /opt/patch-notes

cp .env.production.example .env

# Génère des secrets solides :
echo "BLOG_SECRET=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"

# Édite .env : SITE_URL, GEMINI_API_KEY, secrets ci-dessus
nano .env
chmod 600 .env

chmod +x scripts/*.sh
```

### 3.2 Démarrer la stack Docker

```bash
./scripts/deploy.sh
```

À la fin tu dois voir `==> OK : https://patch-notes.fr`. À ce stade :
- le conteneur tourne et écoute sur `127.0.0.1:3001` (blog) ;
- Apache n'a pas encore le vhost → le domaine ne répond pas encore depuis Internet.

### 3.3 Activer le vhost Apache + obtenir le SSL

```bash
# Copie du vhost versionné
sudo cp apache/sites-available/patch-notes.fr.conf /etc/apache2/sites-available/

# Adapte ServerName / ServerAdmin si ton domaine diffère
sudo nano /etc/apache2/sites-available/patch-notes.fr.conf

# Active + valide
sudo a2ensite patch-notes.fr
sudo apache2ctl configtest
sudo systemctl reload apache2

# Test HTTP : doit afficher du HTML du blog
curl -I http://patch-notes.fr/

# Génère le certificat Let's Encrypt + reconfigure Apache pour HTTPS
sudo certbot --apache -d patch-notes.fr -d www.patch-notes.fr

# Vérifie le renouvellement auto
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

Cf. `apache/README.md` pour les détails et le dépannage Apache.

---

## 4. Mises à jour (du dépôt distant)

```bash
cd /opt/patch-notes
./scripts/deploy.sh         # git pull + rebuild blog + restart si nécessaire
./scripts/deploy.sh --logs  # idem + tail des logs

# Si tu as modifié le vhost dans le repo :
sudo cp apache/sites-available/*.conf /etc/apache2/sites-available/
sudo apache2ctl configtest && sudo systemctl reload apache2
```

Le script fait du **rolling update** : il ne recrée que le conteneur qui a changé. Les migrations Prisma sont jouées automatiquement au boot du blog (`prisma migrate deploy`).

> ⚠️ **Créneaux cron manqués** : le scheduler interne (`blog/automation/scheduler.js`) ne rattrape pas les créneaux (6h/11h/18h/23h) tombés pendant un redémarrage du conteneur - il n'y a pas de mécanisme de "catch-up". Si un redémarrage chevauche un créneau, ce créneau est simplement sauté pour les sujets concernés ; le suivant se déclenche normalement.

---

## 5. Sauvegardes automatiques

```bash
# Backup manuel
./scripts/backup.sh

# Cron quotidien à 04h15, garde 14 jours
crontab -e
# Ajoute :
15 4 * * *  cd /opt/patch-notes && BACKUP_KEEP=14 ./scripts/backup.sh >> /var/log/patch-notes-backup.log 2>&1

# Restauration
./scripts/restore.sh backups/patch_notes-20260505-041500.sql.gz
```

Pour une copie hors-site, je recommande [`restic`](https://restic.net/) ou [`rclone`](https://rclone.org/) qui pousse `./backups/` vers Backblaze B2 / S3 / un serveur SFTP.

---

## 6. Gestion quotidienne

| Action | Commande |
|---|---|
| État des conteneurs | `docker compose -f docker-compose.yml -f docker-compose.prod.yml ps` |
| Logs blog | `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f blog` |
| Logs Apache | `sudo tail -f /var/log/apache2/patch-notes.fr-error.log` |
| Redémarrer le blog | `docker compose -f docker-compose.yml -f docker-compose.prod.yml restart blog` |
| Recharger Apache | `sudo systemctl reload apache2` |
| Shell postgres | `docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres psql -U patchnotes -d patch_notes` |
| Tout arrêter | `docker compose -f docker-compose.yml -f docker-compose.prod.yml down` |
| Tout supprimer (⚠️ data) | `docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v` |

**Astuce** : alias dans `~/.bashrc` :

```bash
alias dcp='docker compose -f /opt/patch-notes/docker-compose.yml -f /opt/patch-notes/docker-compose.prod.yml'
# Puis : dcp logs -f blog   /   dcp ps   /   dcp restart blog
```

---

## 7. Ajouter un nouveau sujet (depuis le serveur)

Tout est automatique grâce aux scripts du dossier `blog/automation/topics/` :

```bash
cd /opt/patch-notes

# 1) Scaffold un fichier de config
node blog/automation/topics/new.js musique "Musique" "Albums, concerts, charts FR & internationales." fr-intl

# 2) Édite blog/automation/topics/configs/musique.js (ajoute sources, keywords, hints éditoriaux)
nano blog/automation/topics/configs/musique.js

# 3) Redémarre le blog pour recharger la liste des sujets
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart blog
```

Le sujet apparaît immédiatement dans le hub avec sa description (upserté au boot par le scheduler), et tourne selon les créneaux fixes (6h/11h/18h/23h). Voir `blog/automation/topics/README.md` pour le détail.

---

## 8. Rollback rapide

```bash
cd /opt/patch-notes
git log --oneline -10               # repère le commit stable
git checkout <sha-du-commit-stable>
./scripts/deploy.sh --no-pull       # rebuild sur l'ancien code
```

Pour les données, voir la restauration de backup section 5.

---

## 9. Monitoring minimal recommandé

Service externe (UptimeRobot, BetterStack, Healthchecks.io) qui sonde toutes les 5 min :

- `https://patch-notes.fr/health` → renvoie `{"ok":true}` si la BDD répond

---

## 10. Sécurité — checklist post-déploiement

- [ ] DNS pointe bien vers le serveur (`dig +short patch-notes.fr` doit donner ton IP).
- [ ] `https://patch-notes.fr` répond en HTTPS sans avertissement.
- [ ] `curl http://<IP-serveur>:3001` est refusé (blog pas exposé sur l'IP publique).
- [ ] `curl http://<IP-serveur>:5432` est refusé (postgres pas exposé).
- [ ] `.env` est en `chmod 600` et n'est pas dans git (`git status` doit l'ignorer).
- [ ] Cron de backup actif (`crontab -l`).
- [ ] SSH key-only (`PasswordAuthentication no` dans `/etc/ssh/sshd_config`).
- [ ] `sudo systemctl status certbot.timer` est actif (renouvellement auto LE).
- [ ] `sudo apache2ctl configtest` retourne `Syntax OK`.

---

## 11. Dépannage

**`502 Bad Gateway` sur `patch-notes.fr`**
→ Conteneur blog down. `dcp ps` → si "exited", regarder `dcp logs blog`.

**`502 Bad Gateway` immédiat alors que le conteneur est up**
→ Apache ne peut pas joindre `127.0.0.1:3001`. Vérifie : `ss -tlnp | grep 3001` (doit montrer le mapping). Si `127.0.0.1:5432` n'apparaît pas non plus côté postgres, c'est normal (Docker network).

**`blog` ne démarre pas — erreur Prisma `P1001`**
→ Postgres pas prêt. Vérifie `POSTGRES_PASSWORD` dans `.env`, puis `dcp restart blog`.

**Gemini renvoie 429 / 503**
→ Augmente `GEMINI_MAX_WAIT_SECONDS` (défaut 1800s). La file d'attente en mémoire (`blog/automation/gemini-queue.js`) évite déjà la majorité des cas.

**Certbot échoue : `connection refused` ou `timeout`**
→ Le DNS n'est pas (encore) propagé, ou `Apache Full` pas autorisé dans ufw. `dig +short patch-notes.fr` doit donner ton IP, et `sudo ufw status` doit lister `Apache Full ALLOW`.

**Le serveur est lent / OOM**
→ Vérifie `docker stats`. Passe à un VPS 2 GB ou ajuste `deploy.resources.limits` dans `docker-compose.prod.yml`.
