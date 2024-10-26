# Rad Analyse - Vollständige Installationsanleitung

Eine optimierte Web-Anwendung zur Analyse radiologischer Untersuchungsdaten. Diese Anleitung führt auch unerfahrene Benutzer sicher durch die Installation im Dual-Betrieb mit der bestehenden Wochenplan-Anwendung.

## Systemvoraussetzungen

### Hardware
- Raspberry Pi 4 (mindestens 4GB RAM)
- MicroSD-Karte (mindestens 32GB)
- Ethernet-Verbindung empfohlen
- Netzteil mit mindestens 3A

### Software-Voraussetzungen
- Raspberry Pi OS Lite (64-bit)
- FRITZ!Box 6660 (konfiguriert mit MyFRITZ!)
- Ports 80 und 443 in der FRITZ!Box auf den Raspberry Pi weitergeleitet

### Node.js-Version
```bash
# Node.js Version 18 oder höher ist erforderlich
node --version  # Sollte v18.0.0 oder höher anzeigen
```

## Installation

### 1. System vorbereiten
```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Erforderliche Pakete installieren
sudo apt install -y git curl wget build-essential nginx sqlite3
```

### 2. Node.js installieren
```bash
# Node.js Repository hinzufügen und installieren
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# NPM-Konfiguration
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# PM2 global installieren
npm install -g pm2
```

### 3. SSL-Zertifikat einrichten
```bash
# Certbot installieren
sudo apt install -y certbot python3-certbot-nginx

# Zertifikat erstellen
sudo certbot --nginx -d raspberrypi.hyg6zkbn2mykr1go.myfritz.net

# Automatische Erneuerung einrichten
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook \"systemctl reload nginx\"") | crontab -

# Erneuerung testen
sudo certbot renew --dry-run
```

### 4. Anwendungsverzeichnisse erstellen
```bash
# Verzeichnisstruktur erstellen
sudo mkdir -p /backup/rad-analyse
sudo mkdir -p /srv

# Berechtigungen für /srv setzen
sudo chown -R pi:pi /srv
sudo chmod -R 755 /srv

# Berechtigungen für Backup-Verzeichnis setzen
sudo chown -R pi:pi /backup/rad-analyse
sudo chmod -R 755 /backup/rad-analyse
```

### 5. Anwendung installieren
```bash
# Repository klonen
cd /srv
git clone https://github.com/mlurz92/rad-analyse.git rad-analyse
cd rad-analyse

# Unterverzeichnisse erstellen
mkdir -p logs uploads server/database public/{css,js,dist}

# Abhängigkeiten installieren
npm install

# Entwicklungsabhängigkeiten installieren (optional)
npm install --save-dev

# Umgebungsvariablen konfigurieren
cp .env.example .env
nano .env
```

Die .env-Datei sollte folgende Werte enthalten:
```env
PORT=3002
NODE_ENV=production
HOST=localhost
DB_PATH=/srv/rad-analyse/server/database/database.sqlite
UPLOAD_PATH=/srv/rad-analyse/uploads
LOG_PATH=/srv/rad-analyse/logs
MAX_UPLOAD_SIZE=52428800
LOG_LEVEL=info
CACHE_ENABLED=true
CACHE_TTL=3600
MAX_CONNECTIONS=100
QUERY_LIMIT=200
```

### 6. Nginx konfigurieren
```bash
# Nginx-Konfiguration erstellen
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
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_session_timeout 10m;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # rad-analyse Konfiguration
    location /rad-analyse/ {
        proxy_pass http://localhost:3002/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        client_max_body_size 50M;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Bestehende wochenplan-radiologie Konfiguration
    location /wochenplan-radiologie/ {
        proxy_pass http://localhost:3003/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP zu HTTPS Weiterleitung
server {
    listen 80;
    server_name raspberrypi.hyg6zkbn2mykr1go.myfritz.net;
    return 301 https://$server_name$request_uri;
}
```

```bash
# Symlink erstellen und Nginx neustarten
sudo ln -s /etc/nginx/sites-available/rad-analyse /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. Datenbank initialisieren
```bash
# Schema anwenden
sqlite3 server/database/database.sqlite < server/database/schema.sql

# Berechtigungen setzen
chmod 660 server/database/database.sqlite
chown pi:pi server/database/database.sqlite
```

### 8. Frontend bauen
```bash
# Build durchführen
npm run build

# Build-Verzeichnis prüfen
ls -la public/dist/
```

### 9. PM2 konfigurieren
```bash
# PM2 Ecosystem-Datei erstellen
cp ecosystem.example.js ecosystem.config.js
nano ecosystem.config.js

# Anwendung starten
pm2 start ecosystem.config.js --env production

# PM2 für Autostart konfigurieren
pm2 save
pm2 startup
```

### 10. Automatische Backups einrichten
```bash
# Backup-Skripte ausführbar machen
chmod +x scripts/*.sh

# Cronjobs einrichten
(crontab -l 2>/dev/null || true; echo "0 3 * * * /srv/rad-analyse/scripts/backup.sh") | crontab -
(crontab -l 2>/dev/null; echo "0 2 * * 0 [ \$(date +\%d) -le 7 ] && /srv/rad-analyse/scripts/maintenance.sh") | crontab -
```

### 11. Logrotation konfigurieren
```bash
sudo tee /etc/logrotate.d/rad-analyse << EOL
/srv/rad-analyse/logs/*.log {
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
EOL
```

## Fehlersuche

### 1. Server startet nicht
```bash
# PM2 Logs prüfen
pm2 logs rad-analyse

# Manueller Start für Debug-Output
cd /srv/rad-analyse
NODE_ENV=production node server/server.js
```

### 2. 502 Bad Gateway
```bash
# Nginx Logs prüfen
sudo tail -f /var/log/nginx/error.log

# Nginx neustarten
sudo systemctl restart nginx

# PM2 Prozess neustarten
pm2 restart rad-analyse
```

### 3. Build-Fehler
```bash
# Build-Abhängigkeiten prüfen
npm install

# Cache leeren und neu bauen
rm -rf node_modules
rm -rf public/dist
npm install
npm run build
```

### 4. Berechtigungsprobleme
```bash
# Berechtigungen neu setzen
sudo chown -R pi:pi /srv/rad-analyse
sudo chmod -R 755 /srv/rad-analyse
sudo chmod 660 server/database/database.sqlite
```

## Wartung

### System aktualisieren
```bash
# System-Updates
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
# Neuestes Backup finden
cd /backup/rad-analyse/$(ls -t /backup/rad-analyse | head -1)

# Datenbank wiederherstellen
sqlite3 /srv/rad-analyse/server/database/database.sqlite ".restore 'database.sqlite'"
```

## Monitoring

### Performance überwachen
```bash
# PM2 Monitoring
pm2 monit

# System-Ressourcen
htop

# Festplattennutzung
df -h
```

### Logs prüfen
```bash
# Anwendungslogs
tail -f /srv/rad-analyse/logs/app.log

# Error-Logs
tail -f /srv/rad-analyse/logs/error.log

# Nginx-Logs
sudo tail -f /var/log/nginx/error.log
```

## Support & Hilfe

Bei Problemen:
1. Prüfen Sie die relevanten Logs (siehe oben)
2. Überprüfen Sie die Systemressourcen
3. Konsultieren Sie die [Issue-Seite](https://github.com/mlurz92/rad-analyse/issues)
4. Erstellen Sie ein neues Issue mit:
   - Detaillierter Problembeschreibung
   - Relevanten Log-Auszügen
   - Systeminformationen

## Lizenz

- Entwickelt für internen Gebrauch
- Alle Rechte vorbehalten
- Stand: Oktober 2024

---

Repository: https://github.com/mlurz92/rad-analyse.git
