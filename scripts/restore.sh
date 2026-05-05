#!/usr/bin/env bash
# =============================================================================
# Restauration d'un dump postgres généré par backup.sh.
# -----------------------------------------------------------------------------
# Usage  :  ./scripts/restore.sh <dump.sql.gz> [database]
#   ex.  :  ./scripts/restore.sh backups/patch_notes-20260505-040015.sql.gz patch_notes
#
# Le script :
#   1) ouvre le .gz et le pipe dans psql via le conteneur postgres.
#   2) la base cible doit déjà exister (init script ou migrations Prisma s'en chargent).
#   3) le dump utilise --clean --if-exists, donc il drop puis recrée les tables.
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -lt 1 ]]; then
	echo "Usage : $0 <dump.sql.gz> [database]" >&2
	exit 2
fi

DUMP_FILE="$1"
DB_NAME="${2:-}"

if [[ ! -f "$DUMP_FILE" ]]; then
	echo "ERREUR : dump introuvable : $DUMP_FILE" >&2
	exit 1
fi

# shellcheck disable=SC1091
source <(grep -E '^(POSTGRES_USER|POSTGRES_DB|BLOG_DB)=' .env)

if [[ -z "$DB_NAME" ]]; then
	# Devine la base depuis le nom du fichier (préfixe avant le timestamp).
	base=$(basename "$DUMP_FILE")
	DB_NAME="${base%%-[0-9]*}"
fi

echo "==> Restauration de $DUMP_FILE → base $DB_NAME"
read -r -p "Cette opération va ÉCRASER les données. Continuer ? [oui/N] " ack
[[ "$ack" == "oui" ]] || { echo "Annulé."; exit 0; }

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

gunzip -c "$DUMP_FILE" | "${COMPOSE[@]}" exec -T postgres \
	psql -U "$POSTGRES_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1

echo "==> OK"
