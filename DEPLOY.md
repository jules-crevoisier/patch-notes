# Déploiement serveur — patch-notes.fr

Guide pas-à-pas pour mettre la stack complète (blog SSR + n8n + Postgres) sur un **VPS Debian** où **Apache** sert de reverse proxy. Tout est conçu pour être **idempotent** : tu peux relancer les commandes sans casser l'existant.

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
        ┌──────────┴──────────────┐
        ▼                         ▼
  patch-notes.fr            n8n.patch-notes.fr
  127.0.0.1:3001            127.0.0.1:5678
   (blog SSR)                (n8n + basic auth)
        │                         │
        └──────────┬──────────────┘
                   ▼
              postgres:5432
        (réseau Docker uniquement,
         invisible depuis l'hôte)
```

Apache fait le TLS (Let's Encrypt via Certbot, renouvellement auto), le proxy HTTP/WebSocket et applique les headers de sécurité. Les conteneurs Docker n'écoutent que sur la loopback `127.0.0.1` : impossible de les atteindre depuis Internet, même si on essaie.

---

## 2. Prérequis serveur (une seule fois)

VPS Debian 12+ (ou Ubuntu LTS) avec **2 GB RAM minimum** (4 GB recommandé pour n8n + Gemini).

```bash
# DNS (à faire AVANT le premier déploiement, sinon Let's Encrypt échoue)
#   A     patch-notes.fr        → IP du serveur
#   A     www.patch-notes.fr    → IP du serveur
#   A     n8n.patch-notes.fr    → IP du serveur
# (ajouter aussi les AAAA si IPv6)

# 1) Apache + modules
sudo apt update
sudo apt install -y apache2 certbot python3-certbot-apache
sudo a2enmod proxy proxy_http proxy_wstunnel headers deflate rewrite ssl remoteip
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
echo "N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"
echo "N8N_BASIC_AUTH_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')"

# Édite .env : SITE_URL, N8N_HOST, GEMINI_API_KEY, secrets ci-dessus
nano .env
chmod 600 .env

chmod +x scripts/*.sh
```

### 3.2 Démarrer la stack Docker

```bash
./scripts/deploy.sh
```

À la fin tu dois voir `==> OK : https://patch-notes.fr` (et `n8n : https://n8n.patch-notes.fr`). À ce stade :
- les conteneurs tournent et écoutent sur `127.0.0.1:3001` (blog) et `127.0.0.1:5678` (n8n) ;
- Apache n'a pas encore les vhosts → les domaines ne répondent pas encore depuis Internet.

### 3.3 Activer les vhosts Apache + obtenir le SSL

```bash
# Copie des vhosts versionnés
sudo cp apache/sites-available/patch-notes.fr.conf       /etc/apache2/sites-available/
sudo cp apache/sites-available/n8n.patch-notes.fr.conf   /etc/apache2/sites-available/

# Adapte ServerName / ServerAdmin si tes domaines diffèrent
sudo nano /etc/apache2/sites-available/patch-notes.fr.conf
sudo nano /etc/apache2/sites-available/n8n.patch-notes.fr.conf

# Active + valide
sudo a2ensite patch-notes.fr n8n.patch-notes.fr
sudo apache2ctl configtest
sudo systemctl reload apache2

# Test HTTP : doit afficher du HTML du blog
curl -I http://patch-notes.fr/

# Génère les certificats Let's Encrypt + reconfigure Apache pour HTTPS
sudo certbot --apache -d patch-notes.fr -d www.patch-notes.fr
sudo certbot --apache -d n8n.patch-notes.fr

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

# Si tu as modifié les vhosts dans le repo :
sudo cp apache/sites-available/*.conf /etc/apache2/sites-available/
sudo apache2ctl configtest && sudo systemctl reload apache2
```

Le script fait du **rolling update** : il ne recrée que les conteneurs qui ont changé. Les migrations Prisma sont jouées automatiquement au boot du blog (`prisma migrate deploy`).

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
| Logs Apache (blog) | `sudo tail -f /var/log/apache2/patch-notes.fr-error.log` |
| Logs Apache (n8n) | `sudo tail -f /var/log/apache2/n8n.patch-notes.fr-error.log` |
| Redémarrer un conteneur | `docker compose -f docker-compose.yml -f docker-compose.prod.yml restart blog` |
| Recharger Apache | `sudo systemctl reload apache2` |
| Shell postgres | `docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres psql -U patchnotes -d patch_notes` |
| Tout arrêter | `docker compose -f docker-compose.yml -f docker-compose.prod.yml down` |
| Tout supprimer (⚠️ data) | `docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v` |

**Astuce** : alias dans `~/.bashrc` :

```bash
alias dcp='docker compose -f /opt/patch-notes/docker-compose.yml -f /opt/patch-notes/docker-compose.prod.yml'
# Puis : dcp logs -f blog   /   dcp ps   /   dcp restart n8n
```

---

## 7. Ajouter un nouveau sujet (depuis le serveur)

Tout est automatique grâce aux scripts du dossier `n8n-workflows/topics/` :

```bash
cd /opt/patch-notes/n8n-workflows/topics

# 1) Scaffold un fichier de config
node new.js musique "Musique" "Albums, concerts, charts FR & internationales." fr-intl

# 2) Édite configs/musique.js (ajoute sources, keywords, hints éditoriaux)
nano configs/musique.js

# 3) Push vers n8n + meta blog + restart n8n
node sync.js
```

Le sujet apparaît immédiatement dans le hub avec sa description, et n8n l'exécute selon les schedules définis. Voir `n8n-workflows/topics/README.md` pour le détail.

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
- `https://n8n.patch-notes.fr/healthz` → renvoie 200 (n8n built-in)

---

## 10. Sécurité — checklist post-déploiement

- [ ] DNS pointe bien vers le serveur (`dig +short patch-notes.fr` doit donner ton IP).
- [ ] `https://patch-notes.fr` répond en HTTPS sans avertissement.
- [ ] `https://n8n.patch-notes.fr` demande basic auth.
- [ ] L'éditeur n8n charge correctement (WebSocket OK : tu vois le canvas, pas un loader infini).
- [ ] `curl http://<IP-serveur>:3001` est refusé (blog pas exposé sur l'IP publique).
- [ ] `curl http://<IP-serveur>:5678` est refusé (n8n pas exposé).
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

**`502 Bad Gateway` immédiat alors que les conteneurs sont up**  
→ Apache ne peut pas joindre `127.0.0.1:3001`. Vérifie : `ss -tlnp | grep 3001` (doit montrer le mapping). Si `127.0.0.1:5432` n'apparaît pas non plus côté postgres, c'est normal (Docker network).

**n8n charge mais l'éditeur reste sur "Loading..."**  
→ WebSocket cassé. Vérifie `mod_proxy_wstunnel` activé : `apachectl -M | grep proxy_wstunnel`. Sinon : `sudo a2enmod proxy_wstunnel && sudo systemctl reload apache2`.

**`blog` ne démarre pas — erreur Prisma `P1001`**  
→ Postgres pas prêt. Vérifie `POSTGRES_PASSWORD` dans `.env`, puis `dcp restart blog`.

**n8n affiche "Version not found" sur un workflow**  
→ Resync : `cd n8n-workflows/topics && node sync.js`.

**Gemini renvoie 429 / 503**  
→ Augmente `GEMINI_MAX_WAIT_SECONDS` (défaut 1800s). La file d'attente sliding-window évite déjà la majorité des cas.

**Certbot échoue : `connection refused` ou `timeout`**  
→ Le DNS n'est pas (encore) propagé, ou `Apache Full` pas autorisé dans ufw. `dig +short patch-notes.fr` doit donner ton IP, et `sudo ufw status` doit lister `Apache Full ALLOW`.

**Le serveur est lent / OOM**  
→ Vérifie `docker stats`. n8n peut consommer 1+ Go en build de workflows. Passe à un VPS 4 GB ou ajuste `deploy.resources.limits` dans `docker-compose.prod.yml`.
