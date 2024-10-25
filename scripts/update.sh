#!/bin/bash
set -e

# Logging einrichten
exec 1> >(logger -s -t $(basename $0)) 2>&1

echo "Starting update process..."

# Backup erstellen
echo "Creating backup before update..."
./scripts/backup.sh

# Git-Updates abrufen
echo "Fetching updates..."
git fetch origin
git reset --hard origin/main

# Dependencies aktualisieren
echo "Updating dependencies..."
npm install
npm audit fix

# Frontend neu bauen
echo "Rebuilding frontend..."
npm run build

# Datenbank-Migrations prüfen
echo "Checking database migrations..."
if [ -f "server/database/migrations.sql" ]; then
    echo "Running database migrations..."
    sqlite3 /srv/rad-analyse/server/database/database.sqlite < server/database/migrations.sql
fi

# Dienste neustarten
echo "Restarting services..."
pm2 reload rad-analyse

# Nginx-Konfiguration neu laden
sudo nginx -t && sudo systemctl reload nginx

echo "Update completed successfully"