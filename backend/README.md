# Population Health Management API

This Laravel-based API provides a comprehensive backend for population health management, implementing both an Inmon-style EDW and Kimball star schema for analytics.

## Architecture

The system uses a dual-schema approach:
- `phm_edw`: Inmon-style normalized EDW for transactional data
- `phm_star`: Kimball star schema for analytics and reporting

### Key Components

1. **Core Models**
   - Patient
   - Provider
   - Organization
   - Encounter
   - Condition/Diagnosis
   - Observation
   - Procedure

2. **Analytics**
   - Risk Stratification
   - Care Gap Analysis
   - Quality Measures
   - Population Health Metrics

3. **Security**
   - Field-level encryption for PHI
   - Audit logging for all PHI access
   - Role-based access control

## Setup

1. Install dependencies:
   ```bash
   composer install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   php artisan key:generate
   ```

3. Configure PostgreSQL connection in `.env`:
   ```
   DB_CONNECTION=pgsql
   DB_HOST=127.0.0.1
   DB_PORT=5432
   DB_DATABASE=your_database
   DB_USERNAME=your_username
   DB_PASSWORD=your_password
   ```

4. Run migrations and seeders:
   ```bash
   php artisan migrate
   php artisan db:seed
   ```

5. Schedule ETL process:
   ```bash
   # Add to crontab
   * * * * * cd /path-to-project && php artisan schedule:run >> /dev/null 2>&1
   ```

## API Endpoints

### Patient Management

```
GET /api/v1/patients
GET /api/v1/patients/{id}
POST /api/v1/patients
PUT /api/v1/patients/{id}
DELETE /api/v1/patients/{id}
```

Response includes:
- Demographics
- Clinical summary
- Risk scores
- Care gaps
- Recent encounters

### Authentication

```
POST /api/login
POST /api/logout
GET /api/user
```

## Data Models

### EDW Schema (phm_edw)

Core entities with full history:
- address
- organization
- provider
- patient
- encounter
- condition_diagnosis
- procedure_performed
- observation
- medication_order

### Star Schema (phm_star)

Optimized for analytics:

Dimensions:
- dim_date
- dim_patient
- dim_provider
- dim_organization
- dim_condition
- dim_procedure
- dim_measure

Facts:
- fact_encounter
- fact_diagnosis
- fact_observation
- fact_care_gap
- fact_measure_result

## Commands

### Data Management

1. Export PHM Data:
```bash
# Export all tables to CSV
./export-phm-data.sh

# Files will be saved to storage/phm/exports/
# Format: {schema}_{table}_{timestamp}.csv
```

2. Import PHM Data:
```bash
# List available import files
./import-phm-data.sh --list

# Import a specific file
./import-phm-data.sh --file storage/phm/imports/phm_edw_patient_20240122.csv

# Import all files in imports directory
./import-phm-data.sh --all
```

3. Import Synthea Data:
```bash
# Import all data types
php artisan phm:import-synthea

# Import specific data type
php artisan phm:import-synthea --type=patients

# Import limited records
php artisan phm:import-synthea --limit=100

# Available types:
# - patients
# - encounters
# - conditions
# - observations
# - all (default)
```

2. Refresh Star Schema:
```bash
php artisan phm:refresh-star-schema
```

The import process:
1. Connects to Synthea database
2. Maps data to PHM EDW schema
3. Imports records with proper relationships
4. Optionally refreshes star schema

The star schema refresh:
1. Updates dimension tables (SCD Type 2)
2. Refreshes fact tables
3. Logs process in `storage/logs/star-schema-refresh.log`

## Database Configuration

The system supports multiple data sources:

1. **Primary PHM Database**
   - Contains EDW and star schemas
   - Stores all clinical and analytical data
   - Connection configured via primary DB env vars

2. **Synthea Database**
   - Contains synthetic patient data
   - Used for development and testing
   - Connection configured via SYNTHEA_* env vars

3. **Data Import/Export**
   - CSV exports stored in `storage/phm/exports/`
   - CSV imports read from `storage/phm/imports/`
   - Follows schema_table_timestamp.csv naming convention

1. **PHM Database** (Primary)
   - Contains EDW and star schemas
   - Stores all clinical and analytical data
   - Connection configured via primary DB env vars

2. **Synthea Database** (Source)
   - Contains synthetic patient data
   - Used for development and testing
   - Connection configured via SYNTHEA_* env vars

Configure in `.env`:
```
# Primary PHM Database
DB_CONNECTION=pgsql
DB_HOST=demo.acumenus.net
DB_PORT=5432
DB_DATABASE=PHM
DB_USERNAME=postgres
DB_PASSWORD=acumenus

# Synthea Database
SYNTHEA_DB_HOST=demo.acumenus.net
SYNTHEA_DB_PORT=5432
SYNTHEA_DB_DATABASE=synthea
SYNTHEA_DB_USERNAME=postgres
SYNTHEA_DB_PASSWORD=acumenus
```

## Security Features

1. **PHI Protection**
   - Sensitive fields (SSN, MRN) are encrypted at rest
   - Access to PHI is logged and audited

2. **Audit Logging**
   - All PHI access is logged to `storage/logs/audit.log`
   - Logs include user, timestamp, IP, and action

3. **Access Control**
   - Role-based access control
   - Field-level security for sensitive data

## Development

### Adding New Features

1. Create migration for EDW tables:
   ```bash
   php artisan make:migration create_new_edw_table --path=database/migrations/edw
   ```

2. Create migration for star schema:
   ```bash
   php artisan make:migration create_new_star_table --path=database/migrations/star
   ```

3. Update ETL process in `RefreshStarSchema` command

### Testing

Run tests:
```bash
php artisan test
```

## Maintenance

### Daily Tasks
- Star schema refresh (automated at midnight)
- Audit log rotation
- Backup verification

### Monthly Tasks
- Review audit logs
- Update reference data
- Verify data quality metrics
