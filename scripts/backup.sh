#!/usr/bin/env bash
# =============================================================================
# Backup quotidien de la base Postgres du blog (patch_notes) avec rotation.
# -----------------------------------------------------------------------------
# Usage  :  ./scripts/backup.sh                # backup local dans ./backups
#           BACKUP_DIR=/srv/backups ./scripts/backup.sh
#           BACKUP_KEEP=14 ./scripts/backup.sh # garde 14 backups (défaut : 7)
#
# Conseil : crontab -e
#   15 4 * * *  cd /opt/patch-notes && ./scripts/backup.sh >> /var/log/patch-notes-backup.log 2>&1
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
source <(grep -E '^(POSTGRES_USER|POSTGRES_DB|BLOG_DB)=' .env)

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

dump() {
	local db="$1"
	local out="$BACKUP_DIR/${db}-${TS}.sql.gz"
	echo "==> Dump ${db} → ${out}"
	"${COMPOSE[@]}" exec -T postgres \
		pg_dump -U "$POSTGRES_USER" -d "$db" --clean --if-exists --no-owner \
		| gzip -9 > "$out"
	# Vérifie que le dump n'est pas vide.
	if [[ ! -s "$out" ]]; then
		echo "ERREUR : dump vide pour ${db}" >&2
		exit 1
	fi
}

DB_NAME="${BLOG_DB:-${POSTGRES_DB:-patch_notes}}"
dump "$DB_NAME"

echo "==> Rotation (garde les ${BACKUP_KEEP} plus récents)"
for db in "$DB_NAME"; do
	# shellcheck disable=SC2010
	ls -1t "$BACKUP_DIR"/"${db}"-*.sql.gz 2>/dev/null \
		| tail -n +"$((BACKUP_KEEP + 1))" \
		| xargs -r rm -v
done

echo "==> OK : $(ls -1 "$BACKUP_DIR" | wc -l) fichiers, $(du -sh "$BACKUP_DIR" | cut -f1) au total"
