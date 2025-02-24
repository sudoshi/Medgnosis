#!/bin/bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color
RED='\033[0;31m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo)${NC}"
    exit 1
fi

# Check if build exists
if [ ! -d "frontend/.next" ] || [ ! -d "backend/vendor" ]; then
    echo -e "${RED}Build files not found. Please run ./build.sh first${NC}"
    exit 1
fi

DEPLOY_PATH="/var/www/Medgnosis"
APP_PATH=$(pwd)

echo -e "${GREEN}Starting deployment to ${DEPLOY_PATH}...${NC}"

# 1. Stop services
echo "Stopping services..."
systemctl stop nextjs-medgnosis || true

# 2. Prepare deployment directory
echo "Preparing deployment directory..."
rm -rf ${DEPLOY_PATH}
mkdir -p ${DEPLOY_PATH}/{frontend,backend}

# 3. Deploy frontend
echo "Deploying frontend..."
cp -r frontend/.next frontend/package*.json frontend/public frontend/node_modules frontend/next.config.js ${DEPLOY_PATH}/frontend/

# Create production env file
cat > ${DEPLOY_PATH}/frontend/.env.production << EOL
NEXT_PUBLIC_API_URL=https://demo.medgnosis.app/api
NEXT_PUBLIC_APP_URL=https://demo.medgnosis.app
EOL

# Create server.js for production
cat > ${DEPLOY_PATH}/frontend/server.js << EOL
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const app = next({ dir: '.', dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    }).listen(3000, (err) => {
        if (err) throw err;
        console.log('> Ready on http://localhost:3000');
    });
});
EOL

# 4. Deploy backend
echo "Deploying backend..."
cp -r backend/* ${DEPLOY_PATH}/backend/

# 5. Configure backend environment
cd ${DEPLOY_PATH}/backend

# Set permissions first
chown -R www-data:www-data ${DEPLOY_PATH}
chmod -R 755 ${DEPLOY_PATH}

# Create .env with initial APP_KEY
cat > .env << EOL
APP_NAME=Medgnosis
APP_ENV=production
APP_KEY=base64:$(openssl rand -base64 32)
APP_DEBUG=false
APP_URL=https://demo.medgnosis.app

LOG_CHANNEL=stack
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=warning

DB_CONNECTION=pgsql
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=PHM
DB_USERNAME=postgres
DB_PASSWORD=acumenus
DB_SCHEMA=prod

BROADCAST_DRIVER=log
CACHE_DRIVER=file
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120
EOL

# Generate new app key and update .env
php artisan key:generate --force

# 6. Clear Laravel caches
echo "Clearing Laravel caches..."
cd ${DEPLOY_PATH}/backend
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear

# 7. Final permission check
echo "Setting final permissions..."
chown -R www-data:www-data ${DEPLOY_PATH}
chmod -R 755 ${DEPLOY_PATH}

# 8. Set up systemd service for Next.js
echo "Creating systemd service for Next.js..."
cat > /etc/systemd/system/nextjs-medgnosis.service << EOL
[Unit]
Description=Next.js Frontend for Medgnosis
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${DEPLOY_PATH}/frontend
Environment=PORT=3000
Environment=NODE_ENV=production
Environment=NEXT_PUBLIC_API_URL=https://demo.medgnosis.app/api
Environment=NEXT_PUBLIC_APP_URL=https://demo.medgnosis.app
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOL

# 9. Start services
echo "Starting services..."
systemctl daemon-reload
systemctl enable nextjs-medgnosis
systemctl restart nextjs-medgnosis
systemctl restart apache2

echo -e "${GREEN}Deployment complete!${NC}"
echo "Frontend should be accessible at https://demo.medgnosis.app"
echo "Backend API at https://demo.medgnosis.app/api"