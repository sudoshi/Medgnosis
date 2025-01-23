#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database connection details (from .env)
DB_HOST="demo.acumenus.net"
DB_PORT="5432"
DB_NAME="PHM"
DB_USER="postgres"
DB_PASS="acumenus"

# Export directory
EXPORT_DIR="storage/phm/exports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Ensure export directory exists
mkdir -p "$EXPORT_DIR"

echo -e "${GREEN}Starting PHM data export...${NC}"

# Function to export a table
export_table() {
    local schema=$1
    local table=$2
    local filename="${EXPORT_DIR}/${schema}_${table}_${TIMESTAMP}.csv"

    echo -e "${YELLOW}Exporting ${schema}.${table}...${NC}"
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
        -c "\COPY ${schema}.${table} TO '${filename}' WITH CSV HEADER;"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Successfully exported to ${filename}${NC}"
    else
        echo -e "\033[0;31mFailed to export ${schema}.${table}${NC}"
    fi
}

# Export EDW tables
EDW_TABLES=(
    "address"
    "organization"
    "provider"
    "patient"
    "encounter"
    "condition"
    "condition_diagnosis"
    "procedure"
    "procedure_performed"
    "observation"
)

for table in "${EDW_TABLES[@]}"; do
    export_table "phm_edw" "$table"
done

# Export Star Schema tables
STAR_TABLES=(
    "dim_date"
    "dim_patient"
    "dim_provider"
    "dim_organization"
    "dim_condition"
    "dim_procedure"
    "dim_measure"
    "fact_encounter"
    "fact_diagnosis"
    "fact_observation"
    "fact_care_gap"
    "fact_measure_result"
)

for table in "${STAR_TABLES[@]}"; do
    export_table "phm_star" "$table"
done

echo -e "${GREEN}Export complete! Files are in ${EXPORT_DIR}${NC}"
echo -e "${YELLOW}Note: Exported files contain PHI. Handle with appropriate security measures.${NC}"
