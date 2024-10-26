#!/bin/bash
set -e

# Logging einrichten
exec 1> >(logger -s -t $(basename $0)) 2>&1

echo "Starting maintenance tasks..."

# Anwendung stoppen
pm2 stop rad-analyse

# Datenbank optimieren
echo "Optimizing database..."
sqlite3 /srv/rad-analyse/server/database/database.sqlite <<EOF
PRAGMA integrity_check;
PRAGMA foreign_key_check;
PRAGMA quick_check;
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA mmap_size=30000000000;
VACUUM;
ANALYZE;
EOF

# Logs bereinigen
echo "Cleaning logs..."
find /var/log/rad-analyse -name "*.log" -mtime +30 -delete

# Upload-Verzeichnis bereinigen
echo "Cleaning upload directory..."
find /srv/rad-analyse/uploads -type f -mtime +1 -delete

# NPM Cache bereinigen
echo "Cleaning npm cache..."
npm cache clean --force

# Dependencies aktualisieren
echo "Updating dependencies..."
cd /srv/rad-analyse
npm update
npm audit fix

# Frontend neu bauen
echo "Rebuilding frontend..."
npm run build

# Anwendung neustarten
echo "Restarting application..."
pm2 restart rad-analyse

# Performance Status
echo "Current system status:"
free -h
df -h
pm2 status

echo "Maintenance completed successfully"