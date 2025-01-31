# Population Health Management (PHM) Database Foundation

A comprehensive healthcare data platform combining enterprise data management with analytical capabilities, designed to support population health initiatives for medium to large healthcare organizations.

## Overview

This project implements a hybrid data architecture that merges the reliability of Inmon's Enterprise Data Warehouse (EDW) approach with the analytical power of Kimball's dimensional modeling. The foundation supports both operational healthcare data management and sophisticated population health analytics.

### Core Capabilities

The platform enables healthcare organizations to:

- Track and analyze patient health outcomes across populations
- Monitor and close care gaps systematically
- Calculate and report electronic Clinical Quality Measures (eCQMs)
- Support value-based care initiatives
- Enable risk stratification and patient cohort analysis
- Maintain comprehensive patient and provider histories
- Generate regulatory and quality improvement reports

## Architecture

Our architecture follows a two-phase approach that separates operational data storage from analytical processing:

### Phase 1: Enterprise Data Warehouse (3NF)

The EDW serves as the system of record, implemented in Third Normal Form (3NF) for data integrity and operational efficiency. Key components include:

- **Core Entities**
  - Patient demographics and history
  - Provider and organization hierarchies
  - Address and location management
  
- **Clinical Data**
  - Encounters and visits
  - Diagnoses (ICD-10, SNOMED)
  - Procedures (CPT, HCPCS)
  - Observations and lab results (LOINC)
  - Medications and prescriptions (RxNorm, NDC)
  
- **Supporting Data**
  - Insurance and coverage information
  - Care gap tracking
  - Social Determinants of Health (SDOH)
  - Patient attribution and program enrollment

### Phase 2: Analytics Star Schema

The dimensional model optimizes for analytical queries and reporting:

- **Fact Tables**
  - Encounters (visits and admissions)
  - Diagnoses (with support for both acute and chronic conditions)
  - Procedures performed
  - Medication orders
  - Clinical observations
  - Care gaps
  - Quality measure results

- **Dimension Tables**
  - Date (with fiscal period support)
  - Patient (Type 2 SCD)
  - Provider (Type 2 SCD)
  - Organization (Type 2 SCD)
  - Condition (ICD-10/SNOMED)
  - Procedure (CPT/HCPCS)
  - Medication
  - Quality Measures

## Technical Implementation

### Database Requirements

- PostgreSQL 12+ (primary implementation)
- Minimum storage allocation for 1.5M patient records
- Support for concurrent analytical queries
- Partitioning capability for large fact tables

### ETL Framework

The system includes a robust ETL framework that:

- Refreshes dimensional data using SCD Type 2 for tracking historical changes
- Supports both full and incremental loading patterns
- Implements slowly changing dimension (SCD) management
- Maintains data lineage and audit trails
- Executes 8 times daily for near-real-time analytics

### Performance Optimizations

- Implemented table partitioning for large fact tables
- Designed efficient indexing strategies
- Optimized SCD Type 2 processing for dimension updates
- Supports both full refresh and incremental loading patterns
- Includes query optimization for common analytical patterns

### Data Security

- Role-based access control (RBAC)
- PHI encryption at rest
- Audit logging of data access and changes
- HIPAA-compliant data handling procedures

## Getting Started

1. **Database Setup**
   ```sql
   -- Create schemas
   CREATE SCHEMA phm_edw;
   CREATE SCHEMA phm_star;
   ```

2. **Create EDW Tables**
   - Execute `phm-edw-ddl.sql` to create the 3NF structure
   - Review and configure security settings

3. **Create Star Schema**
   - Execute `phm-kimbal-ddl.sql` to create dimensional tables
   - Configure table partitioning if needed

4. **Initialize ETL Process**
   - Configure ETL parameters in `ETL_Refresh_Full.sql`
   - Set up scheduling for 8x daily refresh
   - Test incremental load patterns

## Maintenance and Operations

### Regular Maintenance Tasks

- Monitor ETL execution logs
- Review table statistics and update as needed
- Manage table partitions
- Archive historical data as needed

### Performance Monitoring

- Track ETL execution times
- Monitor fact table growth
- Analyze query performance patterns
- Review and update statistics regularly

## Contributing

We welcome contributions to improve the PHM Database Foundation. Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request with detailed description
4. Ensure all existing tests pass

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.

## Documentation

For detailed technical documentation, please refer to:

- [Architecture Overview](docs/architecture.md)
- [EDW Schema Guide](docs/edw-schema.md)
- [Star Schema Guide](docs/star-schema.md)
- [ETL Documentation](docs/etl-processes.md)
