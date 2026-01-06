#!/bin/sh
set -e

# Function to check if Postgres is ready
check_postgres() {
  echo "Checking PostgreSQL..."
  timeout 60 bash -c "
    until pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; do
      echo 'Waiting for database...'
      sleep 2
    done
  "
  echo "PostgreSQL is ready!"
}

# Ensure uploads and logs directories exist
mkdir -p public/uploads logs
chmod -R 775 public/uploads logs

# Wait for database
check_postgres

# Initialize database if needed
echo "Initializing database..."
node scripts/init-db-simple.js || echo "Database already initialized or error ignored"

# Start Next.js server
echo "Starting Next.js app..."
exec node server.js
