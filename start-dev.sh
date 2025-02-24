#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color
RED='\033[0;31m'
YELLOW='\033[1;33m'

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Function to cleanup processes
cleanup() {
    echo -e "\n${YELLOW}Cleaning up processes...${NC}"
    if [ -f "backend/.laravel.pid" ]; then
        kill $(cat backend/.laravel.pid) 2>/dev/null
        rm backend/.laravel.pid
    fi
    if [ -f "frontend/.next.pid" ]; then
        kill $(cat frontend/.next.pid) 2>/dev/null
        rm frontend/.next.pid
    fi
}

# Set up trap to cleanup on script exit
trap cleanup EXIT

# Ensure we're in the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${GREEN}Starting development environment...${NC}"

# Check if required ports are available
if check_port 8000; then
    echo -e "${RED}Error: Port 8000 is already in use${NC}"
    exit 1
fi

if check_port 3000; then
    echo -e "${RED}Error: Port 3000 is already in use${NC}"
    exit 1
fi

# Start Backend
echo -e "${GREEN}Starting Laravel backend...${NC}"
cd backend || { echo -e "${RED}Error: backend directory not found${NC}"; exit 1; }

# Ensure .env file exists and has correct database settings
if [ ! -f ".env" ]; then
    if [ ! -f ".env.example" ]; then
        echo -e "${RED}Error: .env.example not found${NC}"
        exit 1
    fi
    cp .env.example .env
    php artisan key:generate
fi

# Set database configuration
if [ ! -w ".env" ]; then
    echo -e "${RED}Error: .env file is not writable${NC}"
    exit 1
fi

# Update database configuration
sed -i "s/DB_CONNECTION=.*/DB_CONNECTION=pgsql/" .env
sed -i "s/DB_HOST=.*/DB_HOST=localhost/" .env
sed -i "s/DB_PORT=.*/DB_PORT=5432/" .env
sed -i "s/DB_DATABASE=.*/DB_DATABASE=PHM/" .env
sed -i "s/DB_USERNAME=.*/DB_USERNAME=postgres/" .env
sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=acumenus/" .env
grep -q "DB_SCHEMA" .env || echo "DB_SCHEMA=prod" >> .env

# Clear any existing caches
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear

# Start Laravel development server in the background
php artisan serve --port=8000 &
LARAVEL_PID=$!
echo $LARAVEL_PID > .laravel.pid

# Wait for Laravel to start
echo -e "${YELLOW}Waiting for Laravel to start...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:8000 >/dev/null; then
        echo -e "${GREEN}Laravel backend started on http://localhost:8000${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}Error: Laravel failed to start${NC}"
        cleanup
        exit 1
    fi
    sleep 1
done

# Start Frontend
echo -e "${GREEN}Starting Next.js frontend...${NC}"
cd ../frontend || { echo -e "${RED}Error: frontend directory not found${NC}"; exit 1; }

# Clear next.js cache
if [ -d ".next" ]; then
    rm -rf .next || {
        echo -e "${RED}Failed to remove .next directory${NC}"
        exit 1
    }
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install --legacy-peer-deps || {
        echo -e "${RED}Error: npm install failed${NC}"
        exit 1
    }
fi

# Start Next.js development server
echo "Starting Next.js server..."
npm run dev &
NEXT_PID=$!
echo $NEXT_PID > .next.pid

# Wait for Next.js to start
echo -e "${YELLOW}Waiting for Next.js to start...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:3000 >/dev/null; then
        echo -e "${GREEN}Next.js frontend started on http://localhost:3000${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}Error: Next.js failed to start${NC}"
        cleanup
        exit 1
    fi
    sleep 1
done

echo -e "${GREEN}Development environment is ready!${NC}"
echo -e "Frontend: http://localhost:3000"
echo -e "Backend: http://localhost:8000"

# Keep the script running
wait
