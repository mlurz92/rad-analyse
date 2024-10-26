#!/bin/bash
set -e

# Farben für Ausgaben
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Starting Rad Analyse installation...${NC}"

# Systemabhängigkeiten installieren
echo -e "${GREEN}Installing system dependencies...${NC}"
sudo apt update
sudo apt install -y git curl wget build-essential nginx sqlite3 certbot python3-certbot-nginx

# Node.js installieren
echo -e "${GREEN}Installing Node.js...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# NPM Global Setup
echo -e "${GREEN}Configuring npm...${NC}"
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# PM2 installieren
echo -e "${GREEN}Installing PM2...${NC}"
npm install -g pm2

# Verzeichnisse erstellen
echo -e "${GREEN}Creating directories...${NC}"
sudo mkdir -p /srv/rad-analyse
sudo mkdir -p /var/log/rad-analyse
sudo mkdir -p /backup/rad-analyse

# Berechtigungen setzen
sudo chown -R pi:pi /srv/rad-analyse
sudo chown -R pi:pi /var/log/rad-analyse
sudo chown -R pi:pi /backup/rad-analyse

# Repository klonen
echo -e "${GREEN}Cloning repository...${NC}"
cd /srv
git clone https://github.com/mlurz92/rad-analyse.git rad-analyse
cd rad-analyse

# Abhängigkeiten installieren
echo -e "${GREEN}Installing dependencies...${NC}"
npm install

# Build durchführen
echo -e "${GREEN}Building frontend...${NC}"
npm run build

# Datenbank initialisieren
echo -e "${GREEN}Initializing database...${NC}"
mkdir -p server/database
sqlite3 server/database/database.sqlite < server/database/schema.sql
chmod 640 server/database/database.sqlite
chown pi:pi server/database/database.sqlite

# Skripte ausführbar machen
chmod +x scripts/*.sh
chmod +x setup-services.sh

echo -e "${BLUE}Installation completed. Please run setup-services.sh to configure services.${NC}"