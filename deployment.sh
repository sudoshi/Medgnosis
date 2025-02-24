#!/bin/bash
# deployment.sh - Server-side deployment script for Medgnosis

echo "Starting Medgnosis deployment process..."

# Backend deployment
if [ -d "/var/www/Medgnosis/backend" ]; then
  echo "Installing backend dependencies..."
  cd /var/www/Medgnosis/backend
  composer install --no-dev --optimize-autoloader
  
  # Copy .env if it doesn't exist
  if [ ! -f .env ] && [ -f .env.example ]; then
    echo "Creating .env file from example..."
    cp .env.example .env
  fi
  
  # Generate key if needed
  if ! grep -q "APP_KEY=" .env || grep -q "APP_KEY=$" .env; then
    echo "Generating application key..."
    php artisan key:generate
  fi
  
  # Clear caches
  echo "Clearing Laravel caches..."
  php artisan config:clear
  php artisan route:clear
  php artisan view:clear
  
  echo "Backend deployment completed"
else
  echo "Error: Backend directory not found"
  exit 1
fi

# Frontend deployment
if [ -d "/var/www/Medgnosis/frontend" ]; then
  echo "Setting up frontend..."
  
  # Copy server.js to frontend directory if needed
  if [ ! -f "/var/www/Medgnosis/frontend/server.js" ]; then
    echo "Copying server.js to frontend directory..."
    if [ -f "/var/www/Medgnosis/frontend/.next/standalone/server.js" ]; then
      cp /var/www/Medgnosis/frontend/.next/standalone/server.js /var/www/Medgnosis/frontend/
    else
      echo "Warning: server.js not found in .next/standalone directory"
    fi
  fi
  
  echo "Frontend deployment completed"
else
  echo "Error: Frontend directory not found"
  exit 1
fi

echo "Deployment process completed successfully"
echo "Note: Service restart may need to be done manually by an administrator"
