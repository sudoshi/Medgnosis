#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up Population Health Management Platform...${NC}"

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cp .env.example .env
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
composer install

# Generate application key
echo -e "${YELLOW}Generating application key...${NC}"
php artisan key:generate

# Test database connection
echo -e "${YELLOW}Testing database connection...${NC}"
if ! php artisan db:show --json > /dev/null 2>&1; then
    echo -e "\033[0;31mError: Could not connect to database. Please check your .env configuration.${NC}"
    exit 1
fi

# Run migrations and ensure test users exist
echo -e "${YELLOW}Running database migrations...${NC}"
if ! php artisan migrate --force; then
    echo -e "\033[0;31mError: Migration failed.${NC}"
    exit 1
fi

# Ensure test users exist
echo -e "${YELLOW}Ensuring test users exist...${NC}"
if ! php artisan users:ensure-test; then
    echo -e "\033[0;31mError: Failed to create test users.${NC}"
    exit 1
fi

# Ask if user wants to import Synthea data
echo -e "${YELLOW}Would you like to import data from Synthea? (y/n)${NC}"
read -r response

if [[ "$response" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
    echo -e "${YELLOW}How many records would you like to import? (Enter a number, or 'all' for all records)${NC}"
    read -r limit

    if [ "$limit" = "all" ]; then
        echo -e "${YELLOW}Importing all Synthea data...${NC}"
        php artisan phm:import-synthea
    else
        echo -e "${YELLOW}Importing $limit records from Synthea...${NC}"
        php artisan phm:import-synthea --limit="$limit"
    fi

    # Ask if user wants to refresh star schema
    echo -e "${YELLOW}Would you like to refresh the star schema? (y/n)${NC}"
    read -r refresh_response

    if [[ "$refresh_response" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
        echo -e "${YELLOW}Refreshing star schema...${NC}"
        php artisan phm:refresh-star-schema
    fi
fi

# Set up scheduler
echo -e "${YELLOW}Setting up scheduler...${NC}"
echo -e "${GREEN}Add the following line to your crontab:${NC}"
echo "* * * * * cd $(pwd) && php artisan schedule:run >> /dev/null 2>&1"

echo -e "${GREEN}Setup complete!${NC}"
echo -e "${GREEN}You can now:${NC}"
echo -e "1. Import more Synthea data: ${YELLOW}php artisan phm:import-synthea${NC}"
echo -e "2. Refresh star schema: ${YELLOW}php artisan phm:refresh-star-schema${NC}"
echo -e "3. Start the development server: ${YELLOW}php artisan serve${NC}"
