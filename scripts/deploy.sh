#!/usr/bin/env bash
# =============================================================================
# Déploiement / mise à jour zéro-downtime du stack patch-notes sur un serveur.
# -----------------------------------------------------------------------------
# Usage  :  ./scripts/deploy.sh                # deploy + migrations + restart
#           ./scripts/deploy.sh --no-pull      # skip git pull (build local)
#           ./scripts/deploy.sh --logs         # tail les logs après deploy
#
# Prérequis serveur (une seule fois) :
#   - VPS Debian/Ubuntu récent avec Apache + Certbot installés
#   - Modules : a2enmod proxy proxy_http proxy_wstunnel headers deflate rewrite ssl remoteip
#   - Vhosts Apache copiés depuis apache/sites-available/ (cf. apache/README.md)
#   - DNS A/AAAA pointant vers le serveur pour le domaine du blog et N8N_HOST
#   - Docker Engine + Compose v2 (`docker compose version` doit afficher v2.x)
#   - Fichier `.env` configuré (cf. .env.production.example)
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

NO_PULL=0
TAIL_LOGS=0
for arg in "$@"; do
	case "$arg" in
		--no-pull) NO_PULL=1 ;;
		--logs)    TAIL_LOGS=1 ;;
		*) echo "Argument inconnu : $arg" >&2; exit 2 ;;
	esac
done

if [[ ! -f .env ]]; then
	echo "ERREUR : .env manquant. Copie .env.production.example vers .env et configure-le." >&2
	exit 1
fi

# Vérifie les variables critiques (compose `:?` casserait avec un message peu clair).
required=(SITE_URL N8N_HOST POSTGRES_PASSWORD BLOG_SECRET N8N_ENCRYPTION_KEY N8N_BASIC_AUTH_USER N8N_BASIC_AUTH_PASSWORD GEMINI_API_KEY)
missing=()
for var in "${required[@]}"; do
	if ! grep -qE "^${var}=.+" .env; then
		missing+=("$var")
	fi
done
if [[ ${#missing[@]} -gt 0 ]]; then
	echo "ERREUR : variables manquantes ou vides dans .env :" >&2
	printf '  - %s\n' "${missing[@]}" >&2
	exit 1
fi

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

if [[ "$NO_PULL" -eq 0 ]]; then
	echo "==> git pull"
	git pull --rebase --autostash
fi

echo "==> Pull des images de base (postgres, n8n, caddy)"
"${COMPOSE[@]}" pull --ignore-buildable

echo "==> Build du blog"
"${COMPOSE[@]}" build blog

echo "==> Up -d (création/maj des conteneurs nécessaires uniquement)"
"${COMPOSE[@]}" up -d --remove-orphans

echo "==> Attente du healthcheck blog (max 60s)"
deadline=$(( SECONDS + 60 ))
while (( SECONDS < deadline )); do
	status=$("${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}' | awk '$1=="blog" {print $2}')
	if [[ "$status" == "healthy" ]]; then
		echo "    blog OK"
		break
	fi
	sleep 2
done
if [[ "${status:-}" != "healthy" ]]; then
	echo "AVERTISSEMENT : le blog n'a pas atteint l'état healthy. Logs :" >&2
	"${COMPOSE[@]}" logs --tail 50 blog >&2
	exit 1
fi

echo "==> Resync des sujets n8n (templates + push + meta blog)"
if [[ -f n8n-workflows/topics/sync.js ]]; then
	"${COMPOSE[@]}" exec -T n8n sh -lc 'cd /workflows && node sync.js --no-restart' 2>/dev/null || \
		echo "    (skip : workflows pas montés dans le conteneur, à lancer depuis l'hôte si besoin)"
fi

echo "==> État final"
"${COMPOSE[@]}" ps

if [[ "$TAIL_LOGS" -eq 1 ]]; then
	echo "==> Tail logs (Ctrl+C pour quitter)"
	"${COMPOSE[@]}" logs -f --tail=20
fi

echo "==> OK : $(grep -oP '(?<=^SITE_URL=).+' .env)"
echo "    n8n  : https://$(grep -oP '(?<=^N8N_HOST=).+' .env)"
