#!/bin/bash

# Stop services if running
if systemctl is-active --quiet php8.2-fpm; then
    sudo systemctl stop php8.2-fpm
fi

if systemctl is-active --quiet apache2; then
    sudo systemctl stop apache2
fi

# Sync latest code from local Git repository to deployment directory
rsync -av --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'backend/vendor' \
    --exclude '.next' \
    /home/acumenus/GitHub/Medgnosis/ /var/www/Medgnosis/

# Remove existing .next directory in deployment location
sudo rm -rf /var/www/Medgnosis/frontend/.next

# Clear Laravel cache
cd /var/www/Medgnosis/backend
sudo -u www-data php artisan config:clear
sudo -u www-data php artisan route:clear

# Install backend dependencies
composer install --no-interaction --prefer-dist --optimize-autoloader

# Install frontend dependencies and build static site
cd ../frontend
npm ci

# Set permissions before build
sudo chown -R $(whoami):$(whoami) .
sudo rm -rf .next out
NEXT_TELEMETRY_DISABLED=1 npm run build

# Copy static build and set permissions
sudo mkdir -p /var/www/Medgnosis/frontend/out
sudo cp -R out/* /var/www/Medgnosis/frontend/out/
sudo chown -R www-data:www-data /var/www/Medgnosis/frontend/out

# Set backend permissions
sudo chown -R www-data:www-data /var/www/Medgnosis/backend/storage
sudo chown -R www-data:www-data /var/www/Medgnosis/backend/bootstrap/cache

# Start services
sudo systemctl start php8.2-fpm
sudo systemctl start apache2

# Log output
echo "Deployment completed successfully on $(date)" >> /var/log/deploy.log
