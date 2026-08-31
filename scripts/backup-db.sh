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

# libpq no se agrega al PATH por si solo: buscarlo donde suele quedar.
PG_DUMP="$(command -v pg_dump || true)"
if [ -z "$PG_DUMP" ]; then
  for candidate in \
    /opt/homebrew/opt/libpq/bin/pg_dump \
    /usr/local/opt/libpq/bin/pg_dump \
    /opt/local/lib/postgresql*/bin/pg_dump \
    /Applications/Postgres.app/Contents/Versions/*/bin/pg_dump; do
    if [ -x "$candidate" ]; then PG_DUMP="$candidate"; break; fi
  done
fi

if [ -z "$PG_DUMP" ]; then
  echo "No hay pg_dump." >&2
  echo "  macOS:  brew install libpq && brew link --force libpq" >&2
  exit 1
fi

# El host directo (db.<ref>.supabase.co) es solo IPv6 y no conecta desde muchas
# redes. El pooler si resuelve por IPv4.
DB_HOST="$(printf '%s' "$SUPABASE_DB_URL" | sed -E 's#^[^@]+@([^:/?]+).*#\1#')"
case "$DB_HOST" in
  db.*.supabase.co)
    echo "Aviso: SUPABASE_DB_URL usa la conexión directa ($DB_HOST), que es IPv6." >&2
    echo "Si falla con 'No route to host', usa el Session pooler:" >&2
    echo "  Supabase → Project Settings → Database → Connection string → Session pooler" >&2
    echo >&2
    ;;
esac

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/creativos-$(date +%Y-%m-%d).sql.gz"

echo "Respaldando a $FILE…"
"$PG_DUMP" "$SUPABASE_DB_URL" \
  --no-owner \
  --no-privileges \
  --schema=public \
  | gzip > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "Listo: $FILE ($SIZE)"
echo
echo "Para restaurar:  gunzip -c $FILE | psql \"\$SUPABASE_DB_URL\""
