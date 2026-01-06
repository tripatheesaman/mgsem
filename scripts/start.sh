#!/bin/sh
set -e  

# --- Configuration ---
DB_HOST="${DB_HOST:-host.docker.internal}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"

# --- Function to wait for Postgres ---
wait_for_postgres() {
  echo "⏳ Waiting for Postgres at $DB_HOST:$DB_PORT..."
  while ! nc -z "$DB_HOST" "$DB_PORT"; do
    sleep 1
  done
  echo "✅ Postgres is up!"
}

# --- Run ---
wait_for_postgres

echo "🚀 Starting Next.js server..."
# Start Next.js in standalone production mode
node server.js
