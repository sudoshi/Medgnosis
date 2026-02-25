#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color
RED='\033[0;31m'
YELLOW='\033[1;33m'

echo -e "${GREEN}Stopping development environment...${NC}"

# Kill Next.js processes
echo -e "${YELLOW}Stopping Next.js processes...${NC}"
pkill -f "next.*dev" || true
pkill -f "node.*next" || true
[ -f "frontend/.next.pid" ] && rm frontend/.next.pid
echo -e "${GREEN}Next.js processes stopped${NC}"

# Kill Laravel processes
echo -e "${YELLOW}Stopping Laravel processes...${NC}"
pkill -f "artisan serve" || true
[ -f "backend/.laravel.pid" ] && rm backend/.laravel.pid
echo -e "${GREEN}Laravel processes stopped${NC}"

# Double check ports are free
for port in 3000 8000; do
    if lsof -ti :$port >/dev/null 2>&1; then
        pid=$(lsof -ti :$port)
        echo -e "${YELLOW}Force killing process on port $port (PID: $pid)${NC}"
        kill -9 $pid 2>/dev/null || true
    fi
done

# Clear Laravel caches
if [ -d "backend" ]; then
    echo "Clearing Laravel caches..."
    cd backend
    php artisan cache:clear 2>/dev/null || true
    php artisan config:clear 2>/dev/null || true
    php artisan route:clear 2>/dev/null || true
    php artisan view:clear 2>/dev/null || true
    cd ..
fi

echo -e "${GREEN}Development environment stopped successfully${NC}"
