#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Database connection details (from .env)
DB_HOST="demo.acumenus.net"
DB_PORT="5432"
DB_NAME="PHM"
DB_USER="postgres"
DB_PASS="acumenus"

# Import directory
IMPORT_DIR="storage/phm/imports"

# Ensure import directory exists
mkdir -p "$IMPORT_DIR"

echo -e "${GREEN}Starting PHM data import...${NC}"

# Function to import a table
import_table() {
    local schema=$1
    local table=$2
    local file=$3

    if [ ! -f "$file" ]; then
        echo -e "${RED}File not found: ${file}${NC}"
        return 1
    }

    echo -e "${YELLOW}Importing ${file} into ${schema}.${table}...${NC}"
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
        -c "\COPY ${schema}.${table} FROM '${file}' WITH CSV HEADER;"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Successfully imported ${file}${NC}"
    else
        echo -e "${RED}Failed to import ${file}${NC}"
        return 1
    fi
}

# Function to list available import files
list_files() {
    echo -e "${YELLOW}Available import files:${NC}"
    ls -1 "$IMPORT_DIR"/*.csv 2>/dev/null || echo "No CSV files found in $IMPORT_DIR"
}

# Function to show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  -l, --list     List available import files"
    echo "  -f, --file     Specify a single file to import"
    echo "  -a, --all      Import all files in the import directory"
    echo "  -h, --help     Show this help message"
    echo
    echo "Examples:"
    echo "  $0 --list"
    echo "  $0 --file $IMPORT_DIR/phm_edw_patient_20240122.csv"
    echo "  $0 --all"
}

# Parse command line arguments
case "$1" in
    -l|--list)
        list_files
        exit 0
        ;;
    -h|--help)
        show_help
        exit 0
        ;;
    -f|--file)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: File path required${NC}"
            exit 1
        fi

        # Extract schema and table from filename
        filename=$(basename "$2")
        if [[ $filename =~ ^(phm_edw|phm_star)_([^_]+)_ ]]; then
            schema="${BASH_REMATCH[1]}"
            table="${BASH_REMATCH[2]}"
            import_table "$schema" "$table" "$2"
        else
            echo -e "${RED}Error: Invalid filename format. Expected: {schema}_{table}_{timestamp}.csv${NC}"
            exit 1
        fi
        ;;
    -a|--all)
        echo -e "${YELLOW}Importing all CSV files from ${IMPORT_DIR}...${NC}"
        for file in "$IMPORT_DIR"/*.csv; do
            if [ -f "$file" ]; then
                filename=$(basename "$file")
                if [[ $filename =~ ^(phm_edw|phm_star)_([^_]+)_ ]]; then
                    schema="${BASH_REMATCH[1]}"
                    table="${BASH_REMATCH[2]}"
                    import_table "$schema" "$table" "$file"
                else
                    echo -e "${RED}Skipping ${file}: Invalid filename format${NC}"
                fi
            fi
        done
        ;;
    *)
        show_help
        exit 1
        ;;
esac

echo -e "${GREEN}Import process complete!${NC}"

# Ask if user wants to refresh the star schema
if [ "$1" = "-a" ] || [ "$1" = "--all" ]; then
    echo -e "${YELLOW}Would you like to refresh the star schema? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
        echo -e "${YELLOW}Refreshing star schema...${NC}"
        php artisan phm:refresh-star-schema
    fi
fi
