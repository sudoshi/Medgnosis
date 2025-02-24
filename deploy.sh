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

# 1. Stop all services
echo "Stopping services..."
systemctl stop apache2 || true
systemctl stop nextjs-medgnosis || true
pm2 delete all || true

# 2. Clean and prepare deployment directory
echo "Preparing deployment directory..."
rm -rf ${DEPLOY_PATH}
mkdir -p ${DEPLOY_PATH}/{frontend,backend/public}

# 3. Deploy frontend
echo "Deploying frontend..."

# Rebuild frontend with production environment
cd frontend

# Ensure .env.production exists
cat > .env.production << 'EOL'
NEXT_PUBLIC_API_URL=https://demo.medgnosis.app/api
NEXT_PUBLIC_APP_URL=https://demo.medgnosis.app
EOL

# Clean install and build
rm -rf .next node_modules
npm install
NODE_ENV=production npm run build
cd ..

# Copy frontend files
cp -r frontend/.next frontend/package*.json frontend/public ${DEPLOY_PATH}/frontend/

# Create production env files
cat > ${DEPLOY_PATH}/frontend/.env << EOL
NEXT_PUBLIC_API_URL=https://demo.medgnosis.app/api
NEXT_PUBLIC_APP_URL=https://demo.medgnosis.app
EOL

# Also create in .next directory for standalone mode
cat > ${DEPLOY_PATH}/frontend/.next/standalone/.env << EOL
NEXT_PUBLIC_API_URL=https://demo.medgnosis.app/api
NEXT_PUBLIC_APP_URL=https://demo.medgnosis.app
EOL

# 4. Configure Apache
echo "Configuring Apache..."
cp demo-medgnosis.conf /etc/apache2/sites-available/
rm -f /etc/apache2/sites-enabled/*
ln -sf /etc/apache2/sites-available/demo-medgnosis.conf /etc/apache2/sites-enabled/

# Enable required Apache modules
a2enmod proxy
a2enmod proxy_http
a2enmod proxy_fcgi
a2enmod headers
a2enmod rewrite
a2enmod ssl

# 5. Start Next.js with PM2
echo "Starting Next.js application..."
cd ${DEPLOY_PATH}/frontend/.next/standalone
npm install pm2 -g
pm2 start server.js --name "medgnosis-frontend"

# 6. Start Apache
echo "Starting Apache..."
systemctl start apache2

# 7. Check services
echo "Checking service status..."
systemctl status apache2 --no-pager
pm2 status

# 8. Deploy backend
echo "Deploying backend..."
cd ${APP_PATH}
if [ -d "backend" ]; then
    # Install PHP-FPM if not present
    if ! command -v php-fpm &> /dev/null; then
        echo "Installing PHP-FPM..."
        apt-get update && apt-get install -y php8.3-fpm
    fi

    # Configure PHP-FPM
    echo "Configuring PHP-FPM..."
    PHP_VERSION=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
    FPM_CONF="/etc/php/${PHP_VERSION}/fpm/pool.d/www.conf"
    
    sed -i 's/;listen = .*/listen = 127.0.0.1:9000/' "$FPM_CONF"
    sed -i 's/user = .*/user = www-data/' "$FPM_CONF"
    sed -i 's/group = .*/group = www-data/' "$FPM_CONF"

    # Stop services
    PHP_VERSION=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
    systemctl stop "php${PHP_VERSION}-fpm" || true
    
    # Copy backend files
    cp -r backend/* ${DEPLOY_PATH}/backend/
    
    # Install/update composer dependencies
    cd ${DEPLOY_PATH}/backend
    composer install --no-dev --optimize-autoloader

    # Create Laravel .env file if it doesn't exist
    if [ ! -f .env ]; then
        # Generate app key
        APP_KEY="base64:$(openssl rand -base64 32)"
        
        cat > .env << EOL
APP_NAME=Medgnosis
APP_ENV=production
APP_KEY=${APP_KEY}
APP_DEBUG=false
APP_URL=https://demo.medgnosis.app
APP_API_URL=https://demo.medgnosis.app/api

LOG_CHANNEL=stack
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=PHM
DB_SCHEMA=prod
DB_USERNAME=postgres
DB_PASSWORD=acumenus

BROADCAST_DRIVER=log
CACHE_DRIVER=file
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120

SANCTUM_STATEFUL_DOMAINS=demo.medgnosis.app
SESSION_DOMAIN=.medgnosis.app
SESSION_SECURE_COOKIE=true

CORS_ALLOWED_ORIGINS=https://demo.medgnosis.app
CORS_SUPPORTS_CREDENTIALS=true

EOL
    fi
    
    # Generate application key
    php artisan key:generate --force

    # Clear and optimize caches
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
    
    # Set proper permissions
    chown -R www-data:www-data ${DEPLOY_PATH}/backend
    chmod -R 755 ${DEPLOY_PATH}/backend
    chmod -R 775 ${DEPLOY_PATH}/backend/storage
    chmod -R 775 ${DEPLOY_PATH}/backend/bootstrap/cache
    
    # Create Laravel service
    cat > /etc/systemd/system/laravel-medgnosis.service << EOL
[Unit]
Description=Laravel Backend for Medgnosis
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=${DEPLOY_PATH}/backend
ExecStart=/usr/bin/php artisan serve --host=127.0.0.1 --port=8000
Restart=always

[Install]
WantedBy=multi-user.target
EOL

    # Enable and start Laravel service
    systemctl daemon-reload
    systemctl enable laravel-medgnosis
    systemctl start laravel-medgnosis
    systemctl start "php${PHP_VERSION}-fpm"
    
    echo "Backend deployed successfully"
else
    echo -e "${RED}Warning: Backend directory not found, skipping backend deployment${NC}"
fi

echo -e "${GREEN}Deployment completed successfully!${NC}"
echo "Please check https://demo.medgnosis.app to verify the deployment"