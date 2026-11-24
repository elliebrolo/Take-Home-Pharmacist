#!/bin/sh
# Container entrypoint.
#
# Cloud Run's disk is temporary, so the SQLite database is continuously replicated to a Cloud Storage bucket
# (Litestream). On start the newest copy is restored first; on stop the last changes are flushed (SIGTERM).
#
#   LITESTREAM_REPLICA_URL   gcs://BUCKET/PATH   where the database copy lives (required in production)
#   ALLOW_EPHEMERAL_DB=true  run WITHOUT replication: records are lost when the container stops. Never for real data.
#   APP_CMD                  command that starts the server (default below)
set -eu

DB="${DATA_DIR:-/data}/app.db"
APP_CMD="${APP_CMD:-node --import tsx server.ts}"

if [ -z "${LITESTREAM_REPLICA_URL:-}" ]; then
  if [ "${NODE_ENV:-}" = "production" ] && [ "${ALLOW_EPHEMERAL_DB:-}" != "true" ]; then
    echo "Refusing to start: LITESTREAM_REPLICA_URL is not set, so records would be lost on every restart." >&2
    echo "Set it to gcs://BUCKET/PATH, or set ALLOW_EPHEMERAL_DB=true for a throwaway demo." >&2
    exit 1
  fi
  echo "WARNING: running without database replication; data is NOT durable." >&2
  exec $APP_CMD
fi

mkdir -p "$(dirname "$DB")"
# First start: no copy exists yet, which is fine. A copy that exists but cannot be read is an error: do not start empty.
litestream restore -if-db-not-exists -if-replica-exists -o "$DB" "$LITESTREAM_REPLICA_URL"
exec litestream replicate -exec "$APP_CMD" "$DB" "$LITESTREAM_REPLICA_URL"
