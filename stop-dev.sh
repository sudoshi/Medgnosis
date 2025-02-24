#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color
RED='\033[0;31m'

echo -e "${GREEN}Stopping development environment...${NC}"

# Stop Frontend
if [ -f "frontend/.next.pid" ]; then
    NEXT_PID=$(cat frontend/.next.pid)
    echo "Stopping Next.js server (PID: $NEXT_PID)..."
    kill $NEXT_PID 2>/dev/null || true
    rm frontend/.next.pid
    echo -e "${GREEN}Next.js server stopped${NC}"
fi

# Stop Backend
if [ -f "backend/.laravel.pid" ]; then
    LARAVEL_PID=$(cat backend/.laravel.pid)
    echo "Stopping Laravel server (PID: $LARAVEL_PID)..."
    kill $LARAVEL_PID 2>/dev/null || true
    rm backend/.laravel.pid
    echo -e "${GREEN}Laravel server stopped${NC}"
fi

# Clear caches
echo "Clearing Laravel caches..."
cd backend
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear
cd ..

echo -e "${GREEN}Development environment stopped successfully${NC}"
