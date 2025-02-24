#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color
RED='\033[0;31m'

# Kill any existing processes
pkill -f "next" >/dev/null 2>&1
pkill -f "artisan serve" >/dev/null 2>&1

# Remove PID files
rm -f frontend/.next.pid backend/.laravel.pid

# Start Frontend
echo -e "${GREEN}Starting Next.js frontend...${NC}"
cd frontend || { echo -e "${RED}Error: frontend directory not found${NC}"; exit 1; }

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install --legacy-peer-deps || { echo -e "${RED}Error: npm install failed${NC}"; exit 1; }
fi

# Start Next.js
PORT=3000 npx next dev &
echo $! > .next.pid

# Start Backend
echo -e "${GREEN}Starting Laravel backend...${NC}"
cd ../backend || { echo -e "${RED}Error: backend directory not found${NC}"; exit 1; }

# Install Laravel dependencies if needed
if [ ! -d "vendor" ]; then
    echo "Installing Laravel dependencies..."
    composer install || { echo -e "${RED}Error: composer install failed${NC}"; exit 1; }
fi

# Setup .env if needed
if [ ! -f ".env" ]; then
    if [ ! -f ".env.example" ]; then
        echo -e "${RED}Error: .env.example not found${NC}"
        exit 1
    fi
    cp .env.example .env
    php artisan key:generate
fi

# Configure database
sed -i "s/DB_CONNECTION=.*/DB_CONNECTION=pgsql/" .env
sed -i "s/DB_HOST=.*/DB_HOST=localhost/" .env
sed -i "s/DB_PORT=.*/DB_PORT=5432/" .env
sed -i "s/DB_DATABASE=.*/DB_DATABASE=PHM/" .env
sed -i "s/DB_USERNAME=.*/DB_USERNAME=postgres/" .env
sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=acumenus/" .env
grep -q "DB_SCHEMA" .env || echo "DB_SCHEMA=prod" >> .env

# Clear caches
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear

# Start Laravel
php artisan serve &
echo $! > .laravel.pid

echo -e "${GREEN}Development environment is ready!${NC}"
echo -e "Frontend: http://localhost:3000"
echo -e "Backend: http://localhost:8000"
