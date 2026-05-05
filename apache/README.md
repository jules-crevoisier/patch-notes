# Configuration Apache pour patch-notes.fr

Ces vhosts servent de reverse proxy depuis Apache (sur l'hôte) vers les conteneurs Docker qui n'écoutent que sur `127.0.0.1`. Aucun port applicatif n'est exposé sur Internet — seul Apache l'est, sur 80 et 443.

## Architecture

```
Internet
   │
   ▼  443 / 80
┌─────────────────┐
│  Apache (host)  │   ← apache2 + mod_ssl + Let's Encrypt
└──────┬──────────┘
       │ ProxyPass
       ▼
┌─────────────────────────────────────┐
│  Docker daemon (réseau bridge)      │
│   ▸ blog : 127.0.0.1:3001           │
│   ▸ n8n  : 127.0.0.1:5678           │
│   ▸ postgres : réseau Docker only   │
└─────────────────────────────────────┘
```

## Prérequis (une seule fois sur le VPS)

```bash
# Modules Apache
sudo a2enmod proxy proxy_http proxy_wstunnel headers deflate rewrite ssl remoteip

# Certbot pour SSL
sudo apt install -y certbot python3-certbot-apache

# Au cas où ufw soit actif
sudo ufw allow 'Apache Full'
```

## Activer les vhosts

```bash
# 1) Copier les vhosts depuis le repo
sudo cp /opt/patch-notes/apache/sites-available/patch-notes.fr.conf       /etc/apache2/sites-available/
sudo cp /opt/patch-notes/apache/sites-available/n8n.patch-notes.fr.conf   /etc/apache2/sites-available/

# 2) Adapter ServerName / ServerAdmin si tes domaines changent
sudo nano /etc/apache2/sites-available/patch-notes.fr.conf
sudo nano /etc/apache2/sites-available/n8n.patch-notes.fr.conf

# 3) Activer + recharger
sudo a2ensite patch-notes.fr
sudo a2ensite n8n.patch-notes.fr
sudo apache2ctl configtest
sudo systemctl reload apache2

# 4) HTTPS via Certbot (génère + configure auto le bloc :443)
sudo certbot --apache -d patch-notes.fr -d www.patch-notes.fr
sudo certbot --apache -d n8n.patch-notes.fr

# 5) Vérifier le renouvellement auto
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## Modifier les vhosts plus tard

Les vhosts sont versionnés dans le repo (`apache/sites-available/`). Workflow :

```bash
cd /opt/patch-notes
git pull
sudo cp apache/sites-available/*.conf /etc/apache2/sites-available/
sudo apache2ctl configtest
sudo systemctl reload apache2
```

⚠️ Attention : Certbot ajoute un fichier `*-le-ssl.conf` dans `sites-available/` qu'il **gère**. Si tu modifies les vhosts du repo après que Certbot soit passé, refais juste `cp` du fichier `:80` ; ne touche pas au fichier `-le-ssl.conf` à la main, ou mets-le à jour également si tu changes la partie reverse proxy.

## Dépannage

| Symptôme | Diagnostic |
|---|---|
| 502 Bad Gateway sur `patch-notes.fr` | Le conteneur blog est down. `docker compose ... ps` |
| 503 Service Unavailable | `mod_proxy` ou `mod_proxy_http` désactivé. `sudo a2enmod proxy proxy_http && sudo systemctl reload apache2` |
| n8n éditeur reste sur "Loading..." | WebSocket cassé. Vérifie `mod_proxy_wstunnel` activé et le bloc `RewriteRule ws://` |
| Certbot échoue avec `connection refused` | Apache pas relancé après `a2ensite`, ou DNS pas encore propagé |
| n8n affiche "Could not connect" sur les webhooks | `WEBHOOK_URL` dans `.env` ne match pas `https://${N8N_HOST}/`. Refaire `./scripts/deploy.sh` |
| Logs Apache | `sudo tail -f /var/log/apache2/patch-notes.fr-error.log` |
| Logs Docker | `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f blog` |
