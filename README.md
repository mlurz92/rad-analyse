# Rad Analyse - Installationsanleitung für Einsteiger

Diese Anleitung führt Sie Schritt für Schritt durch die Installation der Rad-Analyse-Anwendung auf einem Raspberry Pi 4. Die Anwendung dient zur Verwaltung und Analyse radiologischer Untersuchungsdaten und wird neben einer bestehenden Wochenplan-Anwendung installiert.

## Voraussetzungen

### Hardware
- Raspberry Pi 4 (mindestens 4GB RAM)
- MicroSD-Karte (mindestens 32GB)
- Netzwerkanschluss (vorzugsweise LAN)
- Stromversorgung (mindestens 3A)

### Software & Dienste
- FRITZ!Box 6660 mit MyFRITZ!-Konto
- Raspberry Pi OS Lite (64-bit)
- Bestehendes SSL-Zertifikat für raspberrypi.hyg6zkbn2mykr1go.myfritz.net

### Kenntnisse
- Grundlegende Terminal-Bedienung
- Zugriff auf die FRITZ!Box-Verwaltung

## 1. Grundinstallation Raspberry Pi

Wenn Sie bereits einen funktionierenden Raspberry Pi mit der Wochenplan-Anwendung haben, können Sie direkt zu Schritt 2 springen.

```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Benötigte Pakete installieren
sudo apt install -y git curl wget build-essential sqlite3
```

## 2. Projektverzeichnis vorbereiten

```bash
# Verzeichnisse erstellen
sudo mkdir -p /srv/rad-analyse
sudo mkdir -p /var/log/rad-analyse
sudo mkdir -p /backup/rad-analyse

# Berechtigungen setzen
sudo chown -R pi:pi /srv/rad-analyse
sudo chown -R pi:pi /var/log/rad-analyse
sudo chown -R pi:pi /backup/rad-analyse
```

## 3. Repository klonen und Abhängigkeiten installieren

```bash
# Repository klonen
cd /srv
git clone https://github.com/mlurz92/rad-analyse.git rad-analyse
cd rad-analyse

# Node.js installieren (falls noch nicht vorhanden)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Globale Pakete installieren
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g pm2

# Projektabhängigkeiten installieren
npm install
```

## 4. Konfigurationsdateien erstellen

### .env-Datei erstellen
```bash
cat > .env << EOL
PORT=3002
NODE_ENV=production
DB_PATH=/srv/rad-analyse/server/database/database.sqlite
UPLOAD_PATH=/srv/rad-analyse/uploads
LOG_PATH=/var/log/rad-analyse
MAX_UPLOAD_SIZE=52428800
LOG_LEVEL=info
EOL
```

### Nginx-Konfiguration
```bash
sudo nano /etc/nginx/sites-available/rad-analyse
```

Fügen Sie folgende Konfiguration ein:
```nginx
server {
    listen 443 ssl http2;
    server_name raspberrypi.hyg6zkbn2mykr1go.myfritz.net;

    ssl_certificate /etc/letsencrypt/live/raspberrypi.hyg6zkbn2mykr1go.myfritz.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/raspberrypi.hyg6zkbn2mykr1go.myfritz.net/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    
    # rad-analyse Konfiguration
    location /rad-analyse/ {
        proxy_pass http://localhost:3002/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 50M;
    }

    # Bestehende wochenplan-radiologie Konfiguration
    location /wochenplan-radiologie/ {
        proxy_pass http://localhost:3003/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Symlink erstellen und Nginx neustarten
sudo ln -s /etc/nginx/sites-available/rad-analyse /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 5. Datenbank einrichten

```bash
# Datenbankverzeichnis erstellen
mkdir -p server/database

# Schema initialisieren
sqlite3 server/database/database.sqlite < server/database/schema.sql

# Berechtigungen setzen
chmod 640 server/database/database.sqlite
chown pi:pi server/database/database.sqlite
```

## 6. Frontend Build erstellen

```bash
# Build durchführen
npm run build
```

## 7. Dienste einrichten

```bash
# PM2 Prozess erstellen
pm2 start server/server.js --name rad-analyse \
    --max-memory-restart 1G \
    --node-args="--max-old-space-size=512" \
    --log /var/log/rad-analyse/app.log

# PM2 Autostart konfigurieren
pm2 save
pm2 startup
```

## 8. Backup und Wartung einrichten

```bash
# Skripte ausführbar machen
chmod +x scripts/*.sh

# Cronjobs einrichten
(crontab -l 2>/dev/null || true; echo "0 3 * * * /srv/rad-analyse/scripts/backup.sh") | crontab -
(crontab -l 2>/dev/null; echo "0 2 * * 0 [ \$(date +\%d) -le 7 ] && /srv/rad-analyse/scripts/maintenance.sh") | crontab -
```

## 9. Logrotation konfigurieren

```bash
sudo nano /etc/logrotate.d/rad-analyse
```

Fügen Sie folgende Konfiguration ein:
```
/var/log/rad-analyse/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 pi pi
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

## 10. Anwendung testen

1. Öffnen Sie im Browser: https://raspberrypi.hyg6zkbn2mykr1go.myfritz.net/rad-analyse/
2. Sie sollten die Benutzeroberfläche sehen
3. Testen Sie den Upload einer JSON-Datei (Beispieldatei im Repository)

## Fehlersuche

### Logs überprüfen
```bash
# PM2 Logs
pm2 logs rad-analyse

# Nginx Logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Anwendungslogs
tail -f /var/log/rad-analyse/app.log
```

### Häufige Probleme

1. **Seite nicht erreichbar**
   ```bash
   sudo systemctl status nginx
   pm2 status
   ```

2. **Upload funktioniert nicht**
   ```bash
   # Berechtigungen prüfen
   ls -la /srv/rad-analyse/uploads
   # Speicherplatz prüfen
   df -h
   ```

3. **Datenbank-Fehler**
   ```bash
   # Berechtigungen prüfen
   ls -la /srv/rad-analyse/server/database
   # Datenbankintegrität prüfen
   sqlite3 /srv/rad-analyse/server/database/database.sqlite "PRAGMA integrity_check;"
   ```

## Wartung

### Systemaktualisierung
```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Anwendung aktualisieren
cd /srv/rad-analyse
git pull
npm install
npm run build
pm2 restart rad-analyse
```

### Backup wiederherstellen
```bash
# Zum neuesten Backup wechseln
cd /backup/rad-analyse/$(ls -t /backup/rad-analyse | head -1)

# Datenbank wiederherstellen
sqlite3 /srv/rad-analyse/server/database/database.sqlite ".restore 'database.sqlite'"
```

## Support

Bei Problemen:
1. Überprüfen Sie die Logs (siehe Fehlersuche)
2. Kontrollieren Sie die Systemressourcen (`htop`, `df -h`)
3. Repository-Issues durchsuchen
4. Neues Issue erstellen mit:
   - Problembeschreibung
   - Relevante Logauszüge
   - Systemzustand

## Lizenz & Anmerkungen

- Entwickelt für internen Gebrauch
- Alle Rechte vorbehalten
- Stand: Oktober 2024

---

Weitere Informationen und Updates finden Sie im Repository: https://github.com/mlurz92/rad-analyse.git   
