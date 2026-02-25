#!/bin/bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color
RED='\033[0;31m'

# Check if running as root (we don't want that)
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Please run as regular user, not root${NC}"
    exit 1
fi

echo -e "${GREEN}Starting build process...${NC}"

# 0. Clean up any root-owned files
echo "Cleaning up any root-owned files..."
sudo rm -rf frontend/.next frontend/node_modules backend/vendor
sudo chown -R $(whoami):$(whoami) .

# 1. Build Frontend
echo "Building frontend..."
cd frontend

# Clean and install dependencies
rm -rf .next node_modules
npm install

# Build Next.js
echo "Building Next.js application..."
npm run build

# Verify frontend build succeeded
if [ ! -d ".next" ]; then
    echo -e "${RED}Frontend build failed!${NC}"
    exit 1
fi

# 2. Build Backend
echo -e "\nPreparing backend..."
cd ../backend

# Install composer dependencies
composer install

# Verify backend build succeeded
if [ ! -d "vendor" ]; then
    echo -e "${RED}Backend build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Build complete!${NC}"
echo "You can now run 'sudo ./deploy.sh' to deploy the application"
