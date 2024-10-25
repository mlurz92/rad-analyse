# Deinstallationsanleitung rad-analyse

Diese Anleitung führt Sie Schritt für Schritt durch die sichere Entfernung der rad-analyse Anwendung. Die zweite Anwendung (wochenplan-radiologie) auf Port 3000 bleibt dabei unberührt.

## Vorbereitungen

1. Melden Sie sich als Benutzer 'pi' auf Ihrem Raspberry Pi an
2. Öffnen Sie ein Terminal
3. Erstellen Sie vor der Deinstallation ein Backup der Datenbank (optional):
```bash
cd /srv/rad-analyse
./scripts/backup.sh
```

## 1. Dienste stoppen und deaktivieren

```bash
# PM2-Prozess stoppen und entfernen
pm2 stop rad-analyse
pm2 delete rad-analyse
pm2 save

# Logrotate-Konfiguration entfernen
sudo rm /etc/logrotate.d/rad-analyse

# Cronjobs entfernen (sichern Sie vorher die bestehenden Jobs)
crontab -l > /tmp/crontab_backup
sed -i '/rad-analyse/d' /tmp/crontab_backup
crontab /tmp/crontab_backup
```

## 2. Nginx-Konfiguration anpassen

1. Sichern Sie die aktuelle Nginx-Konfiguration:
```bash
sudo cp /etc/nginx/sites-available/rad-analyse /etc/nginx/sites-available/rad-analyse.backup
```

2. Bearbeiten Sie die Konfigurationsdatei:
```bash
sudo nano /etc/nginx/sites-available/rad-analyse
```

3. Entfernen Sie den rad-analyse Block und behalten Sie nur den wochenplan-radiologie Block:
```nginx
# Hauptserver-Block für HTTPS
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
    
    # wochenplan-radiologie Konfiguration
    location /wochenplan-radiologie/ {
        proxy_pass http://localhost:3000/;
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

4. Nginx neustarten:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

## 3. Dateien und Verzeichnisse entfernen

```bash
# Anwendungsverzeichnis entfernen
sudo rm -rf /srv/rad-analyse

# Log-Verzeichnis entfernen
sudo rm -rf /var/log/rad-analyse

# Backup-Verzeichnis entfernen (optional, wenn Backups nicht benötigt werden)
sudo rm -rf /backup/rad-analyse

# Upload-Verzeichnis entfernen
sudo rm -rf /srv/rad-analyse/uploads

# Temporäre Dateien bereinigen
sudo rm -f /tmp/rad-analyse*
```

## 4. SQLite-Datenbank entfernen

```bash
# Datenbank und zugehörige Dateien entfernen
sudo rm -f /srv/rad-analyse/server/database/database.sqlite*
```

## 5. Node.js Abhängigkeiten bereinigen

```bash
# Globalen Cache bereinigen
npm cache clean --force

# PM2 Startup-Konfiguration aktualisieren
pm2 save
pm2 startup
```

## 6. Abschließende Prüfung

1. Prüfen Sie, ob die wochenplan-radiologie Anwendung noch läuft:
```bash
pm2 status
```

2. Testen Sie den Zugriff auf die wochenplan-radiologie Anwendung:
```bash
curl -I https://raspberrypi.hyg6zkbn2mykr1go.myfritz.net/wochenplan-radiologie/
```

3. Überprüfen Sie den Speicherplatz:
```bash
df -h
```

## Fehlerbehebung

Falls Probleme auftreten:

1. Prüfen Sie die Nginx-Logs:
```bash
sudo tail -f /var/log/nginx/error.log
```

2. Überprüfen Sie die PM2-Prozesse:
```bash
pm2 list
```

3. Nginx-Konfiguration testen:
```bash
sudo nginx -t
```

4. Bei Problemen mit der wochenplan-radiologie Anwendung:
```bash
pm2 restart wochenplan-radiologie
```

## Wichtige Hinweise

- Führen Sie vor der Deinstallation ein Backup durch, falls Sie später Daten benötigen
- Die SSL-Zertifikate bleiben erhalten, da sie auch von der wochenplan-radiologie Anwendung genutzt werden
- Nach der Deinstallation ist die wochenplan-radiologie Anwendung weiterhin unter der URL mit dem Pfad /wochenplan-radiologie/ erreichbar
- Die Nginx-Konfiguration wurde so angepasst, dass sie nur noch die wochenplan-radiologie Anwendung bedient
- Alle Cronjobs und Logrotate-Einträge der rad-analyse Anwendung wurden entfernt

Bei Fragen oder Problemen erstellen Sie bitte ein Issue im GitHub Repository oder wenden Sie sich an den Support.
