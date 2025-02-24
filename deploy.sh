#!/bin/bash

# Stop services if running
if systemctl is-active --quiet php8.2-fpm; then
    sudo systemctl stop php8.2-fpm
fi

if systemctl is-active --quiet apache2; then
    sudo systemctl stop apache2
fi

# Clear Laravel cache
cd /var/www/Medgnosis/backend
sudo -u www-data php artisan config:clear
sudo -u www-data php artisan route:clear

# Pull latest code
git pull origin main

# Install dependencies
composer install
cd ../frontend
npm install

# Clear previous build
rm -rf .next

# Build frontend assets
npm run build

# Set permissions
sudo chown -R www-data:www-data /var/www/Medgnosis/backend/storage
sudo chown -R www-data:www-data /var/www/Medgnosis/backend/bootstrap/cache

# Start services
sudo systemctl start php8.2-fpm
sudo systemctl start apache2

# Log output
echo "Deployment completed successfully on $(date)" >> /var/log/deploy.log
