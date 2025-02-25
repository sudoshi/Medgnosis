# Local Deployment Guide for Medgnosis

This guide explains how to deploy the Medgnosis application locally on an Apache server.

## Overview

The Medgnosis application consists of two main components:

1. **Frontend**: A Next.js application that provides the user interface
2. **Backend**: A Laravel API that provides the data and business logic

The local deployment uses Apache as a reverse proxy to route requests to the appropriate service:

- Frontend requests are routed to the Next.js server running on port 3001
- API requests are routed to the Laravel server running on port 8001

## Prerequisites

- Ubuntu server with Apache installed
- Node.js 18+ and npm
- PHP 8.1+ and Composer
- PostgreSQL database
- SSL certificate for the domain (Let's Encrypt recommended)

## Deployment Steps

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/Medgnosis.git
cd Medgnosis
```

### 2. Run the Deployment Script

The deployment script automates the entire process:

```bash
sudo chmod +x local-deploy.sh
sudo ./local-deploy.sh
```

This script will:

- Copy the frontend and backend files to the deployment directory
- Set up the environment files
- Configure Apache as a reverse proxy
- Set up systemd services for Next.js and Laravel
- Install dependencies and build the applications
- Enable and restart all necessary services

### 3. Test the Deployment

After deployment, you can test if everything is working correctly:

```bash
sudo chmod +x test-local-deploy.sh
sudo ./test-local-deploy.sh
```

## Manual Deployment

If you prefer to deploy manually, follow these steps:

### 1. Set Up the Deployment Directory

```bash
sudo mkdir -p /var/www/Medgnosis
sudo rsync -av --exclude="node_modules" --exclude=".next" frontend/ /var/www/Medgnosis/frontend/
sudo rsync -av --exclude="vendor" --exclude="node_modules" backend/ /var/www/Medgnosis/backend/
```

### 2. Set Up Environment Files

#### Frontend (.env)

```
NEXT_PUBLIC_API_URL=https://demo.medgnosis.app/api
```

#### Backend (.env)

```
APP_NAME=Medgnosis
APP_ENV=production
APP_KEY=base64:Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Yd+Y
APP_DEBUG=false
APP_URL=https://demo.medgnosis.app

LOG_CHANNEL=stack
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug

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

SANCTUM_STATEFUL_DOMAINS=demo.medgnosis.app
SESSION_DOMAIN=.demo.medgnosis.app
```

### 3. Set Up Apache Configuration

Create a new Apache configuration file at `/etc/apache2/sites-available/demo-medgnosis.conf`:

```apache
# Redirect all HTTP traffic to HTTPS
<VirtualHost *:80>
    ServerName demo.medgnosis.app
    Redirect permanent / https://demo.medgnosis.app/
</VirtualHost>

<VirtualHost *:443>
    ServerName demo.medgnosis.app
    ServerAdmin webmaster@demo.medgnosis.app
    
    # Backend API - Proxy to Laravel on port 8001
    ProxyPreserveHost On
    ProxyPass /api http://localhost:8001/api
    ProxyPassReverse /api http://localhost:8001/api
    
    # Enable CORS
    <Location /api>
        SetEnvIfNoCase Origin "^(https://demo\.medgnosis\.app\.?)" ORIGIN=$1
        Header always set Access-Control-Allow-Origin "%{ORIGIN}e" env=ORIGIN
        Header always set Access-Control-Allow-Methods "POST, GET, OPTIONS, DELETE, PUT"
        Header always set Access-Control-Allow-Headers "Content-Type, Authorization, X-XSRF-TOKEN"
        Header always set Access-Control-Allow-Credentials "true"
        
        RewriteEngine On
        RewriteCond %{REQUEST_METHOD} OPTIONS
        RewriteRule ^(.*)$ $1 [R=200,L]
    </Location>
    
    # Frontend Next.js Server
    ProxyPass /api !
    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/

    # Security headers
    Header set X-Content-Type-Options "nosniff"
    Header set X-Frame-Options "SAMEORIGIN"
    Header set X-XSS-Protection "1; mode=block"

    ErrorLog ${APACHE_LOG_DIR}/error.log
    CustomLog ${APACHE_LOG_DIR}/access.log combined

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/demo.medgnosis.app/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/demo.medgnosis.app/privkey.pem
</VirtualHost>
```

### 4. Set Up Systemd Services

#### Next.js Service

Create a file at `/etc/systemd/system/nextjs.service`:

```ini
[Unit]
Description=Next.js Production Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/Medgnosis/frontend
ExecStart=/usr/bin/node /var/www/Medgnosis/frontend/server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

#### Laravel Service

Create a file at `/etc/systemd/system/laravel.service`:

```ini
[Unit]
Description=Laravel Production Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/Medgnosis/backend
ExecStart=/usr/bin/php -S 0.0.0.0:8001 -t /var/www/Medgnosis/backend/public
Restart=on-failure
Environment=APP_ENV=production

[Install]
WantedBy=multi-user.target
```

### 5. Build and Install Dependencies

#### Frontend

```bash
cd /var/www/Medgnosis/frontend
npm install
npm run build
```

#### Backend

```bash
cd /var/www/Medgnosis/backend
composer install --no-dev --optimize-autoloader
```

### 6. Set Permissions

```bash
sudo chown -R www-data:www-data /var/www/Medgnosis
sudo chmod -R 755 /var/www/Medgnosis
```

### 7. Enable and Start Services

```bash
sudo a2enmod proxy proxy_http ssl headers rewrite
sudo a2ensite demo-medgnosis.conf
sudo systemctl enable nextjs.service
sudo systemctl enable laravel.service
sudo systemctl restart apache2
sudo systemctl restart nextjs
sudo systemctl restart laravel
```

## Troubleshooting

### API Not Accessible

If the API is not accessible, check the following:

1. Make sure the Laravel service is running:
   ```bash
   sudo systemctl status laravel
   ```

2. Check the Laravel logs:
   ```bash
   sudo tail -n 50 /var/www/Medgnosis/backend/storage/logs/laravel.log
   ```

3. Make sure the Apache proxy configuration is correct:
   ```bash
   sudo apachectl -t
   ```

### Frontend Not Loading

If the frontend is not loading, check the following:

1. Make sure the Next.js service is running:
   ```bash
   sudo systemctl status nextjs
   ```

2. Check the Next.js logs:
   ```bash
   sudo journalctl -u nextjs
   ```

3. Make sure the frontend is built correctly:
   ```bash
   cd /var/www/Medgnosis/frontend
   sudo npm run build
   ```

## Maintenance

### Updating the Application

To update the application, pull the latest changes from the repository and run the deployment script again:

```bash
cd /path/to/repository
git pull
sudo ./local-deploy.sh
```

### Restarting Services

If you need to restart the services:

```bash
sudo systemctl restart apache2
sudo systemctl restart nextjs
sudo systemctl restart laravel
```

## Security Considerations

- The application uses HTTPS for all communication
- API requests are properly authenticated using Laravel Sanctum
- CORS is configured to only allow requests from the same domain
- Security headers are set to prevent common web vulnerabilities
