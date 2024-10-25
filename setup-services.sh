#!/bin/bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Setting up services for Rad Analyse...${NC}"

# Nginx Setup
echo -e "${GREEN}Configuring Nginx...${NC}"
sudo cp nginx/rad-analyse /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/rad-analyse /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# SSL-Zertifikate
echo -e "${GREEN}Setting up SSL certificates...${NC}"
sudo certbot --nginx -d raspberrypi.hyg6zkbn2mykr1go.myfritz.net

# PM2 Setup
echo -e "${GREEN}Configuring PM2...${NC}"
pm2 start server/server.js --name rad-analyse \
    --max-memory-restart 1G \
    --node-args="--max-old-space-size=512" \
    --log /var/log/rad-analyse/app.log

pm2 save
pm2 startup

# Logrotate Setup
echo -e "${GREEN}Configuring logrotate...${NC}"
sudo tee /etc/logrotate.d/rad-analyse << EOL
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
EOL

# Cronjobs einrichten
echo -e "${GREEN}Setting up cronjobs...${NC}"
(crontab -l 2>/dev/null || true; echo "0 3 * * * /srv/rad-analyse/scripts/backup.sh") | crontab -
(crontab -l 2>/dev/null; echo "0 2 * * 0 [ \$(date +\%d) -le 7 ] && /srv/rad-analyse/scripts/maintenance.sh") | crontab -
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook \"systemctl reload nginx\"") | crontab -

# Services neustarten
echo -e "${GREEN}Restarting services...${NC}"
sudo systemctl restart nginx

echo -e "${BLUE}Service setup completed. The application is now running and accessible.${NC}"