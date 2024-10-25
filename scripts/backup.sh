#!/bin/bash
set -e

# Konfiguration
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/rad-analyse"
DB_FILE="/srv/rad-analyse/server/database/database.sqlite"
LOG_DIR="/var/log/rad-analyse"
BACKUP_PATH="${BACKUP_DIR}/${DATE}"
RETENTION_DAYS=30

# Hilfsfunktion für Logging
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "${BACKUP_DIR}/backup.log"
}

# Backup-Verzeichnis erstellen
mkdir -p "${BACKUP_PATH}"
log "Starting backup to ${BACKUP_PATH}"

# Datenbank sichern
log "Backing up database..."
if [ -f "$DB_FILE" ]; then
    sqlite3 "$DB_FILE" ".backup '${BACKUP_PATH}/database.sqlite'"
    log "Database backup completed"
else
    log "ERROR: Database file not found at $DB_FILE"
    exit 1
fi

# Logs sichern
log "Backing up logs..."
if [ -d "$LOG_DIR" ]; then
    tar -czf "${BACKUP_PATH}/logs.tar.gz" -C "$LOG_DIR" .
    log "Logs backup completed"
else
    log "WARNING: Log directory not found at $LOG_DIR"
fi

# Konfiguration sichern
log "Backing up configuration..."
cp /srv/rad-analyse/.env "${BACKUP_PATH}/"
cp /srv/rad-analyse/package.json "${BACKUP_PATH}/"

# Alte Backups bereinigen
log "Cleaning old backups..."
find "$BACKUP_DIR" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \;

# Backup verifizieren
log "Verifying backup..."
if [ -f "${BACKUP_PATH}/database.sqlite" ] && [ -f "${BACKUP_PATH}/logs.tar.gz" ]; then
    log "Backup completed successfully"
    # Backup-Größe protokollieren
    BACKUP_SIZE=$(du -sh "${BACKUP_PATH}" | cut -f1)
    log "Backup size: ${BACKUP_SIZE}"
else
    log "ERROR: Backup verification failed"
    exit 1
fi

# Berechtigungen setzen
chmod -R 640 "${BACKUP_PATH}"
chmod 750 "${BACKUP_PATH}"

log "Backup process completed"