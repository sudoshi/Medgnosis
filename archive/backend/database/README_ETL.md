# ETL Process: Population Data to PHM EDW

This document describes the ETL (Extract, Transform, Load) process for migrating data from the `population` schema (source) to the `phm_edw` schema (target) within PostgreSQL databases.

## Purpose

The goal of this ETL process is to populate the Population Health Management Enterprise Data Warehouse (`phm_edw` schema) with data originating from the `population` schema. The `phm_edw` schema follows a 3rd Normal Form (3NF) structure suitable for analytical reporting, while the source `population` schema contains raw, text-based data.

## Source and Target

*   **Source:**
    *   Database: `ohdsi` (Assumed, based on `dblink` connection string)
    *   Schema: `population`
    *   Tables: `patients`, `organizations`, `providers`, `payers`, `conditions`, `procedures`, `medications`, `allergies`, `encounters`, `payer_transitions`, `immunizations`, `observations`.
*   **Target:**
    *   Database: `medgnosis`
    *   Schema: `phm_edw`
    *   Tables: `address`, `organization`, `provider`, `payer`, `patient`, `condition`, `procedure`, `medication`, `allergy`, `encounter`, `patient_insurance_coverage`, `condition_diagnosis`, `procedure_performed`, `medication_order`, `patient_allergy`, `immunization`, `observation`.

## ETL Script

The core logic resides in the `ETL_population_to_phm_edw.sql` script located in this directory.

**Strategy:** Full Refresh (Truncate and Load)

1.  **Truncate:** The script begins by truncating all target tables within the `phm_edw` schema in the correct reverse dependency order using `TRUNCATE ... RESTART IDENTITY CASCADE`. This ensures a clean slate for each run.
2.  **Load Master Tables:** It then populates the master/dimension tables (`address`, `organization`, `provider`, `payer`, `patient`, `condition`, `procedure`, `medication`, `allergy`) by selecting distinct data from the source via `dblink` and inserting it into the target tables. Surrogate keys (`*_id`) are generated automatically using `serial4` sequences.
3.  **Load Transactional Tables:** Finally, it populates the transactional/fact tables (`encounter`, `patient_insurance_coverage`, `condition_diagnosis`, etc.) by joining source data (via `dblink`) with the newly populated master tables in the target schema to look up foreign keys.

**Key Transformations/Handling:**

*   **Cross-Database Connection:** Uses the `dblink` extension to connect from the target `medgnosis` database to the source `ohdsi` database.
*   **Type Casting:** Explicitly casts source `text` data to appropriate target types (`DATE`, `TIMESTAMP`, `NUMERIC`, `VARCHAR`, etc.).
*   **NULL Handling:** Uses `CASE` statements to check for common NULL representations (`\N`, `NULL`, `''`) in source date/timestamp fields before attempting casts, inserting `NULL` if found. Numeric casts use a regex check (`~ '^-?[0-9]+(\.[0-9]+)?$'`) before attempting the cast.
*   **Address Consolidation:** Gathers distinct addresses from multiple source tables into the central `phm_edw.address` table.
*   **Code System Mapping:** Attempts basic mapping for code systems (e.g., SNOMED, ICD-10, CPT) based on source `system` column values where available.
*   **Identifier Mapping:** Assumes `population.patients.id` maps to `phm_edw.patient.mrn` and `population.providers.id` maps to `phm_edw.provider.npi_number`.

## Prerequisites

1.  **PostgreSQL Databases:** Access to both the source (`ohdsi`) and target (`medgnosis`) PostgreSQL databases.
2.  **User Permissions:** The user executing the script (e.g., `postgres`) needs:
    *   Permissions to connect to both databases.
    *   Permissions to use `dblink` in the `medgnosis` database.
    *   `TRUNCATE`, `INSERT`, `SELECT` privileges on the relevant schemas/tables (`phm_edw` in `medgnosis`, `population` in `ohdsi`).
    *   Permissions to create/replace functions in the `phm_edw` schema (if helper functions were used - currently removed).
3.  **`dblink` Extension:** The `dblink` extension must be installed and enabled in the **target** (`medgnosis`) database, specifically within the `phm_edw` schema. This can typically be done once by a superuser:
    ```sql
    -- Connect to medgnosis database
    CREATE EXTENSION IF NOT EXISTS dblink SCHEMA phm_edw;
    ```
4.  **Schema Definitions:** The target `phm_edw` schema and tables must exist in the `medgnosis` database, matching the structure expected by the ETL script (including recent additions like `provider.specialty`, `provider.address_id`, and widened columns like `organization.primary_phone`, `provider.npi_number`). The source `population` schema and tables must exist in the `ohdsi` database.

## Execution

The script is designed to be run using `psql` against the **target** (`medgnosis`) database.

```bash
# Example execution from the project root directory
# Ensure PGPASSWORD is set or authentication is configured (e.g., .pgpass)
PGPASSWORD=<your_password> psql -U postgres -d medgnosis -f backend/database/ETL_population_to_phm_edw.sql
```

Replace `<your_password>` with the actual password for the `postgres` user.

## Notes & Assumptions

*   **Data Integrity:** The script assumes source identifiers (like `patient.id`, `provider.id`, `condition.code`) are reasonably unique for joining purposes. Data quality issues in the source may lead to errors or incorrect links.
*   **Error Handling:** Basic error handling for type casting is included for dates/timestamps via `CASE` statements. Direct numeric casts might fail if source data is invalid. The entire script runs within a single transaction (`BEGIN`/`COMMIT`), so any error should cause a `ROLLBACK`, leaving the target tables unchanged from their pre-run state (which is truncated).
*   **Performance:** For very large datasets, performance might be an issue. Optimizations like indexing source tables or breaking the ETL into smaller batches might be necessary.
*   **Excluded Tables:** Some source tables (`claims`, `claims_transactions`, `imaging_studies`, `careplans_typed`) and target tables (`care_gap`, `measure_definition`, `sdoh_assessment`, `code_crosswalk`, `etl_log`) are currently out of scope for this ETL process.
*   **Credentials:** The `dblink` connection string currently includes credentials directly. For production environments, consider more secure methods like connection service files or other authentication mechanisms.
