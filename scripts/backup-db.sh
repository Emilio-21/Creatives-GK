#!/usr/bin/env bash
# Respaldo de la base. El free tier de Supabase NO tiene backups automaticos:
# si se corrompe la DB pierdes las metricas (los archivos siguen en R2).
# Correr semanal.
#
#   ./scripts/backup-db.sh              -> backups/creativos-YYYY-MM-DD.sql.gz
#   ./scripts/backup-db.sh /otra/ruta
#
# Necesita SUPABASE_DB_URL en .env.local. Se saca de Supabase → Project Settings
# → Database → Connection string → URI (la de "Session pooler" funciona bien).

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  # shellcheck disable=SC1091
  set -a; source .env.local; set +a
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Falta SUPABASE_DB_URL en .env.local." >&2
  echo "Supabase → Project Settings → Database → Connection string → URI" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "No hay pg_dump. En macOS: brew install libpq && brew link --force libpq" >&2
  exit 1
fi

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/creativos-$(date +%Y-%m-%d).sql.gz"

echo "Respaldando a $FILE…"
pg_dump "$SUPABASE_DB_URL" \
  --no-owner \
  --no-privileges \
  --schema=public \
  | gzip > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "Listo: $FILE ($SIZE)"
echo
echo "Para restaurar:  gunzip -c $FILE | psql \"\$SUPABASE_DB_URL\""
