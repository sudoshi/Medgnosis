-- ETL Script: Load data from population schema to phm_edw schema
-- Strategy: Full Refresh (Truncate and Load)
-- Assumes dblink extension is already enabled in the target database (medgnosis) in the phm_edw schema.

BEGIN; -- Start Transaction

-- ----------------------------------------
-- Truncate Target Tables (Reverse Dependency Order)
-- ----------------------------------------
TRUNCATE TABLE phm_edw.condition_diagnosis RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.procedure_performed RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.medication_order RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.patient_allergy RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.immunization RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.observation RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.encounter RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.patient_insurance_coverage RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.patient_attribution RESTART IDENTITY CASCADE; -- Assuming no source data for this yet
TRUNCATE TABLE phm_edw.care_gap RESTART IDENTITY CASCADE; -- Assuming no source data for this yet
TRUNCATE TABLE phm_edw.sdoh_assessment RESTART IDENTITY CASCADE; -- Assuming no source data for this yet
TRUNCATE TABLE phm_edw.patient RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.provider RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.payer RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.organization RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.address RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw."condition" RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw."procedure" RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.medication RESTART IDENTITY CASCADE;
TRUNCATE TABLE phm_edw.allergy RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE phm_edw.measure_definition RESTART IDENTITY CASCADE; -- No source
-- TRUNCATE TABLE phm_edw.code_crosswalk RESTART IDENTITY CASCADE; -- No source
-- TRUNCATE TABLE phm_edw.etl_log RESTART IDENTITY CASCADE; -- Manage separately

-- ----------------------------------------
-- Load Master Tables
-- ----------------------------------------

-- 1. Address (Combine addresses from patients, organizations, providers, payers in 'ohdsi' db)
WITH distinct_addresses AS (
    SELECT address_line1, address_line2, city, state, zip, county, lat, lon FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$
        SELECT DISTINCT address AS address_line1, NULL AS address_line2, city, state, zip, county, lat, lon FROM population.patients WHERE address IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL AND zip IS NOT NULL
        UNION
        SELECT DISTINCT address AS address_line1, NULL AS address_line2, city, state, zip, NULL AS county, lat, lon FROM population.organizations WHERE address IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL AND zip IS NOT NULL
        UNION
        SELECT DISTINCT address AS address_line1, NULL AS address_line2, city, state, zip, NULL AS county, lat, lon FROM population.providers WHERE address IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL AND zip IS NOT NULL
        UNION
        SELECT DISTINCT address AS address_line1, NULL AS address_line2, city, state_headquartered AS state, zip, NULL AS county, NULL AS lat, NULL AS lon FROM population.payers WHERE address IS NOT NULL AND city IS NOT NULL AND state_headquartered IS NOT NULL AND zip IS NOT NULL
    $$::text) AS t(address_line1 text, address_line2 text, city text, state text, zip text, county text, lat text, lon text)
)
INSERT INTO phm_edw.address (address_line1, address_line2, city, state, zip, county, latitude, longitude, created_date)
SELECT
    address_line1,
    address_line2,
    city,
    state,
    zip,
    county,
    CASE WHEN lat ~ '^-?[0-9]+(\.[0-9]+)?$' THEN lat::NUMERIC(9, 6) ELSE NULL END, -- Direct cast with check
    CASE WHEN lon ~ '^-?[0-9]+(\.[0-9]+)?$' THEN lon::NUMERIC(9, 6) ELSE NULL END, -- Direct cast with check
    NOW()
FROM distinct_addresses;

-- 2. Organization
INSERT INTO phm_edw.organization (organization_name, primary_phone, address_id, created_date)
SELECT DISTINCT
    o.name,
    o.phone, -- Insert full phone number now that column is wider
    a.address_id,
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT id, name, address, city, state, zip, phone FROM population.organizations$$::text)
    AS o(id text, name text, address text, city text, state text, zip text, phone text)
LEFT JOIN phm_edw.address a ON o.address = a.address_line1 AND o.city = a.city AND o.state = a.state AND o.zip = a.zip
WHERE o.name IS NOT NULL;
-- Note: parent_org_id, organization_type, etc. not directly available in source

-- 3. Provider
INSERT INTO phm_edw.provider (display_name, specialty, org_id, primary_phone, address_id, created_date, first_name, last_name, npi_number) -- Corrected typo: speciality -> specialty
SELECT DISTINCT
    p.name,
    p.speciality, -- Source column name is speciality
    org.org_id,
    NULL AS primary_phone, -- Not in source
    a.address_id,
    NOW(),
    -- Attempt to split name (simple split on first space)
    CASE WHEN POSITION(' ' IN p.name) > 0 THEN SUBSTRING(p.name FROM 1 FOR POSITION(' ' IN p.name) - 1) ELSE p.name END AS first_name,
    CASE WHEN POSITION(' ' IN p.name) > 0 THEN SUBSTRING(p.name FROM POSITION(' ' IN p.name) + 1) ELSE NULL END AS last_name,
    p.id AS npi_number -- Assuming provider.id is the NPI
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT id, organization, name, gender, speciality, address, city, state, zip FROM population.providers$$::text)
    AS p(id text, organization text, name text, gender text, speciality text, address text, city text, state text, zip text)
LEFT JOIN phm_edw.organization org ON p.organization = org.organization_name -- Assuming organization name is the link; might need ID mapping if available
LEFT JOIN phm_edw.address a ON p.address = a.address_line1 AND p.city = a.city AND p.state = a.state AND p.zip = a.zip
WHERE p.name IS NOT NULL;
-- Note: license_number, dea_number, email not in source

-- 4. Payer
INSERT INTO phm_edw.payer (payer_name, payer_type, address_id, created_date)
SELECT DISTINCT
    p.name,
    p.ownership AS payer_type, -- Mapping ownership to type
    a.address_id,
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT id, name, ownership, address, city, state_headquartered, zip FROM population.payers$$::text)
    AS p(id text, name text, ownership text, address text, city text, state_headquartered text, zip text)
LEFT JOIN phm_edw.address a ON p.address = a.address_line1 AND p.city = a.city AND p.state_headquartered = a.state AND p.zip = a.zip
WHERE p.name IS NOT NULL;

-- 5. Patient
INSERT INTO phm_edw.patient (mrn, ssn, first_name, middle_name, last_name, date_of_birth, gender, race, ethnicity, marital_status, address_id, primary_phone, email, created_date)
SELECT DISTINCT
    p.id AS mrn, -- Assuming patient.id is the MRN
    p.ssn,
    p.first,
    p.middle,
    p.last,
    CASE WHEN p.birthdate = '\N' OR p.birthdate = '\\N' OR p.birthdate IS NULL OR p.birthdate = '' THEN NULL ELSE p.birthdate::DATE END, -- Check for \N and \\N
    p.gender,
    p.race,
    p.ethnicity,
    p.marital,
    a.address_id,
    NULL AS primary_phone, -- Not in source
    NULL AS email, -- Not in source
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT id, birthdate, deathdate, ssn, drivers, passport, prefix, first, middle, last, suffix, maiden, marital, race, ethnicity, gender, birthplace, address, city, state, county, fips, zip, lat, lon, healthcare_expenses, healthcare_coverage, income FROM population.patients$$::text)
    AS p(id text, birthdate text, deathdate text, ssn text, drivers text, passport text, prefix text, first text, middle text, last text, suffix text, maiden text, marital text, race text, ethnicity text, gender text, birthplace text, address text, city text, state text, county text, fips text, zip text, lat text, lon text, healthcare_expenses text, healthcare_coverage text, income text)
LEFT JOIN phm_edw.address a ON p.address = a.address_line1 AND p.city = a.city AND p.state = a.state AND p.zip = a.zip
WHERE p.id IS NOT NULL AND p.first IS NOT NULL AND p.last IS NOT NULL AND p.birthdate IS NOT NULL;
-- Note: pcp_provider_id, language, next_of_kin not directly mapped

-- 6. Condition
INSERT INTO phm_edw."condition" (condition_code, condition_name, code_system, description, created_date)
SELECT DISTINCT
    code,
    description AS condition_name,
    CASE
        WHEN "system" ILIKE '%snomed%' THEN 'SNOMED'
        WHEN "system" ILIKE '%icd10%' THEN 'ICD-10'
        WHEN "system" ILIKE '%icd9%' THEN 'ICD-9'
        ELSE 'OTHER'
    END AS code_system,
    description,
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT "start", stop, patient, encounter, "system", code, description FROM population.conditions$$::text)
    AS c("start" text, stop text, patient text, encounter text, "system" text, code text, description text)
WHERE c.code IS NOT NULL AND c.description IS NOT NULL;

-- 7. Procedure
INSERT INTO phm_edw."procedure" (procedure_code, procedure_desc, code_system, created_date)
SELECT DISTINCT
    code,
    description AS procedure_desc,
    CASE
        WHEN "system" ILIKE '%cpt%' THEN 'CPT'
        WHEN "system" ILIKE '%hcpcs%' THEN 'HCPCS'
        WHEN "system" ILIKE '%snomed%' THEN 'SNOMED'
        WHEN "system" ILIKE '%icd10%' THEN 'ICD-10-PCS' -- Assumption
        ELSE 'OTHER'
    END AS code_system,
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT "start", stop, patient, encounter, "system", code, description, base_cost, reasoncode, reasondescription FROM population."procedures"$$::text)
    AS p("start" text, stop text, patient text, encounter text, "system" text, code text, description text, base_cost text, reasoncode text, reasondescription text)
WHERE p.code IS NOT NULL AND p.description IS NOT NULL;

-- 8. Medication
INSERT INTO phm_edw.medication (medication_code, medication_name, code_system, created_date)
SELECT DISTINCT
    code,
    description AS medication_name,
    'RXNORM' AS code_system, -- Assuming RxNorm, not specified in source
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT "start", stop, patient, payer, encounter, code, description, base_cost, payer_coverage, dispenses, totalcost, reasoncode, reasondescription FROM population.medications$$::text)
    AS m("start" text, stop text, patient text, payer text, encounter text, code text, description text, base_cost text, payer_coverage text, dispenses text, totalcost text, reasoncode text, reasondescription text)
WHERE m.code IS NOT NULL AND m.description IS NOT NULL;
-- Note: form, strength not in source

-- 9. Allergy
INSERT INTO phm_edw.allergy (allergy_code, allergy_name, code_system, category, created_date)
SELECT DISTINCT
    code,
    description AS allergy_name,
    "system" AS code_system, -- Assuming system maps directly
    category,
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT "start", stop, patient, encounter, code, "system", description, "type", category, reaction1, description1, severity1, reaction2, description2, severity2 FROM population.allergies$$::text)
    AS a("start" text, stop text, patient text, encounter text, code text, "system" text, description text, "type" text, category text, reaction1 text, description1 text, severity1 text, reaction2 text, description2 text, severity2 text)
WHERE a.code IS NOT NULL AND a.description IS NOT NULL;

-- ----------------------------------------
-- Load Transactional Tables
-- ----------------------------------------

-- 10. Encounter
INSERT INTO phm_edw.encounter (patient_id, provider_id, org_id, encounter_number, encounter_type, encounter_reason, admission_datetime, discharge_datetime, encounter_datetime, status, created_date)
SELECT
    pat.patient_id,
    prov.provider_id,
    org.org_id,
    e.id AS encounter_number, -- Assuming encounter.id is the encounter number
    e.encounterclass AS encounter_type,
    e.reasondescription AS encounter_reason,
    CASE WHEN e."start" = '\N' OR e."start" = '\\N' OR e."start" IS NULL OR e."start" = '' THEN NULL ELSE e."start"::TIMESTAMP END AS admission_datetime, -- Check for \N and \\N
    CASE WHEN e."stop" = '\N' OR e."stop" = '\\N' OR e."stop" IS NULL OR e."stop" = '' THEN NULL ELSE e."stop"::TIMESTAMP END AS discharge_datetime, -- Check for \N and \\N
    CASE WHEN e."start" = '\N' OR e."start" = '\\N' OR e."start" IS NULL OR e."start" = '' THEN NULL ELSE e."start"::TIMESTAMP END AS encounter_datetime, -- Check for \N and \\N
    NULL AS status, -- Not in source
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT id, "start", stop, patient, organization, provider, payer, encounterclass, code, description, base_encounter_cost, total_claim_cost, payer_coverage, reasoncode, reasondescription FROM population.encounters$$::text)
    AS e(id text, "start" text, stop text, patient text, organization text, provider text, payer text, encounterclass text, code text, description text, base_encounter_cost text, total_claim_cost text, payer_coverage text, reasoncode text, reasondescription text)
JOIN phm_edw.patient pat ON e.patient = pat.mrn -- Join using the source ID assumed to be MRN
LEFT JOIN phm_edw.provider prov ON e.provider = prov.npi_number -- Join using the source ID assumed to be NPI
LEFT JOIN phm_edw.organization org ON e.organization = org.organization_name -- Join using name, might need ID
WHERE pat.patient_id IS NOT NULL; -- Ensure patient exists

-- 11. Patient Insurance Coverage
INSERT INTO phm_edw.patient_insurance_coverage (patient_id, payer_id, coverage_start_date, coverage_end_date, primary_indicator, created_date)
SELECT
    pat.patient_id,
    pay.payer_id,
    CASE WHEN pt.start_date = '\N' OR pt.start_date = '\\N' OR pt.start_date IS NULL OR pt.start_date = '' THEN NULL ELSE pt.start_date::DATE END, -- Check for \N and \\N
    CASE WHEN pt.end_date = '\N' OR pt.end_date = '\\N' OR pt.end_date IS NULL OR pt.end_date = '' THEN NULL ELSE pt.end_date::DATE END, -- Check for \N and \\N
    CASE WHEN pt.secondary_payer IS NULL THEN 'Y' ELSE 'N' END AS primary_indicator, -- Guessing primary based on secondary presence
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT patient, memberid, start_date, end_date, payer, secondary_payer, plan_ownership, owner_name FROM population.payer_transitions$$::text)
    AS pt(patient text, memberid text, start_date text, end_date text, payer text, secondary_payer text, plan_ownership text, owner_name text)
JOIN phm_edw.patient pat ON pt.patient = pat.mrn
JOIN phm_edw.payer pay ON pt.payer = pay.payer_name -- Joining on name
WHERE pat.patient_id IS NOT NULL AND pay.payer_id IS NOT NULL;
-- Note: policy_number not in source

-- 12. Condition Diagnosis
INSERT INTO phm_edw.condition_diagnosis (patient_id, encounter_id, condition_id, onset_date, resolution_date, created_date)
SELECT
    pat.patient_id,
    enc.encounter_id,
    cond.condition_id,
    CASE WHEN c."start" = '\N' OR c."start" = '\\N' OR c."start" IS NULL OR c."start" = '' THEN NULL ELSE c."start"::DATE END AS onset_date, -- Check for \N and \\N
    CASE WHEN c.stop = '\N' OR c.stop = '\\N' OR c.stop IS NULL OR c.stop = '' THEN NULL ELSE c.stop::DATE END AS resolution_date, -- Check for \N and \\N
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT "start", stop, patient, encounter, "system", code, description FROM population.conditions$$::text)
    AS c("start" text, stop text, patient text, encounter text, "system" text, code text, description text)
JOIN phm_edw.patient pat ON c.patient = pat.mrn
JOIN phm_edw."condition" cond ON c.code = cond.condition_code AND c.description = cond.condition_name -- Join on code and name for better match
LEFT JOIN phm_edw.encounter enc ON c.encounter = enc.encounter_number AND pat.patient_id = enc.patient_id -- Join encounter on ID and patient
WHERE pat.patient_id IS NOT NULL AND cond.condition_id IS NOT NULL;
-- Note: diagnosis_type, status, primary_indicator not directly available

-- 13. Procedure Performed
INSERT INTO phm_edw.procedure_performed (patient_id, encounter_id, procedure_id, procedure_datetime, created_date)
SELECT
    pat.patient_id,
    enc.encounter_id,
    proc.procedure_id,
    CASE WHEN p."start" = '\N' OR p."start" = '\\N' OR p."start" IS NULL OR p."start" = '' THEN NULL ELSE p."start"::TIMESTAMP END AS procedure_datetime, -- Check for \N and \\N
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT "start", stop, patient, encounter, "system", code, description, base_cost, reasoncode, reasondescription FROM population."procedures"$$::text)
    AS p("start" text, stop text, patient text, encounter text, "system" text, code text, description text, base_cost text, reasoncode text, reasondescription text)
JOIN phm_edw.patient pat ON p.patient = pat.mrn
JOIN phm_edw."procedure" proc ON p.code = proc.procedure_code AND p.description = proc.procedure_desc
LEFT JOIN phm_edw.encounter enc ON p.encounter = enc.encounter_number AND pat.patient_id = enc.patient_id
WHERE pat.patient_id IS NOT NULL AND proc.procedure_id IS NOT NULL;
-- Note: provider_id, modifiers not directly available

-- 14. Medication Order (Mapping from population.medications)
INSERT INTO phm_edw.medication_order (patient_id, encounter_id, medication_id, start_datetime, end_datetime, created_date)
SELECT
    pat.patient_id,
    enc.encounter_id,
    med.medication_id,
    CASE WHEN m."start" = '\N' OR m."start" = '\\N' OR m."start" IS NULL OR m."start" = '' THEN NULL ELSE m."start"::TIMESTAMP END AS start_datetime, -- Check for \N and \\N
    CASE WHEN m.stop = '\N' OR m.stop = '\\N' OR m.stop IS NULL OR m.stop = '' THEN NULL ELSE m.stop::TIMESTAMP END AS end_datetime, -- Check for \N and \\N
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT "start", stop, patient, payer, encounter, code, description, base_cost, payer_coverage, dispenses, totalcost, reasoncode, reasondescription FROM population.medications$$::text)
    AS m("start" text, stop text, patient text, payer text, encounter text, code text, description text, base_cost text, payer_coverage text, dispenses text, totalcost text, reasoncode text, reasondescription text)
JOIN phm_edw.patient pat ON m.patient = pat.mrn
JOIN phm_edw.medication med ON m.code = med.medication_code AND m.description = med.medication_name
LEFT JOIN phm_edw.encounter enc ON m.encounter = enc.encounter_number AND pat.patient_id = enc.patient_id
WHERE pat.patient_id IS NOT NULL AND med.medication_id IS NOT NULL;
-- Note: provider_id, dosage, frequency, route, status, refills not available

-- 15. Patient Allergy
INSERT INTO phm_edw.patient_allergy (patient_id, allergy_id, reaction, severity, onset_date, end_date, created_date)
SELECT DISTINCT -- Use DISTINCT as one source row might represent multiple reactions
    pat.patient_id,
    alg.allergy_id,
    -- Combine reactions/severities if present
    TRIM(COALESCE(a.reaction1, '') || CASE WHEN a.reaction2 IS NOT NULL THEN '; ' || a.reaction2 ELSE '' END),
    TRIM(COALESCE(a.severity1, '') || CASE WHEN a.severity2 IS NOT NULL THEN '; ' || a.severity2 ELSE '' END),
    CASE WHEN a."start" = '\N' OR a."start" = '\\N' OR a."start" IS NULL OR a."start" = '' THEN NULL ELSE a."start"::DATE END AS onset_date, -- Check for \N and \\N
    CASE WHEN a.stop = '\N' OR a.stop = '\\N' OR a.stop IS NULL OR a.stop = '' THEN NULL ELSE a.stop::DATE END AS end_date, -- Check for \N and \\N
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT "start", stop, patient, encounter, code, "system", description, "type", category, reaction1, description1, severity1, reaction2, description2, severity2 FROM population.allergies$$::text)
    AS a("start" text, stop text, patient text, encounter text, code text, "system" text, description text, "type" text, category text, reaction1 text, description1 text, severity1 text, reaction2 text, description2 text, severity2 text)
JOIN phm_edw.patient pat ON a.patient = pat.mrn
JOIN phm_edw.allergy alg ON a.code = alg.allergy_code AND a.description = alg.allergy_name
WHERE pat.patient_id IS NOT NULL AND alg.allergy_id IS NOT NULL;
-- Note: Status not directly available

-- 16. Immunization
INSERT INTO phm_edw.immunization (patient_id, vaccine_code, vaccine_name, administration_datetime, created_date)
SELECT
    pat.patient_id,
    i.code AS vaccine_code,
    i.description AS vaccine_name,
    CASE WHEN i."date" = '\N' OR i."date" = '\\N' OR i."date" IS NULL OR i."date" = '' THEN NULL ELSE i."date"::TIMESTAMP END AS administration_datetime, -- Check for \N and \\N
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT "date", patient, encounter, code, description, base_cost FROM population.immunizations$$::text)
    AS i("date" text, patient text, encounter text, code text, description text, base_cost text)
JOIN phm_edw.patient pat ON i.patient = pat.mrn
LEFT JOIN phm_edw.encounter enc ON i.encounter = enc.encounter_number AND pat.patient_id = enc.patient_id -- Encounter link optional
WHERE pat.patient_id IS NOT NULL AND i.code IS NOT NULL AND i.description IS NOT NULL;
-- Note: provider_id, lot_number, site, reaction, status not available

-- 17. Observation
INSERT INTO phm_edw.observation (patient_id, encounter_id, observation_datetime, observation_code, observation_desc, value_numeric, value_text, units, created_date)
SELECT
    pat.patient_id,
    enc.encounter_id,
    CASE WHEN o."date" = '\N' OR o."date" = '\\N' OR o."date" IS NULL OR o."date" = '' THEN NULL ELSE o."date"::TIMESTAMP END AS observation_datetime, -- Check for \N and \\N
    o.code AS observation_code,
    o.description AS observation_desc,
    CASE WHEN o."type" = 'numeric' AND o.value ~ '^-?[0-9]+(\.[0-9]+)?$' THEN o.value::NUMERIC(18, 4) ELSE NULL END AS value_numeric, -- Direct cast with check
    CASE WHEN o."type" != 'numeric' THEN o.value ELSE NULL END AS value_text, -- Store non-numeric as text
    o.units,
    NOW()
FROM phm_edw.dblink('dbname=ohdsi user=postgres password=acumenus'::text, $$SELECT "date", patient, encounter, category, code, description, value, units, "type" FROM population.observations$$::text)
    AS o("date" text, patient text, encounter text, category text, code text, description text, value text, units text, "type" text)
JOIN phm_edw.patient pat ON o.patient = pat.mrn
LEFT JOIN phm_edw.encounter enc ON o.encounter = enc.encounter_number AND pat.patient_id = enc.patient_id
WHERE pat.patient_id IS NOT NULL AND o.code IS NOT NULL;
-- Note: provider_id, reference_range, abnormal_flag, status not available

-- Add more INSERT statements for other tables if mappings are defined (e.g., devices, supplies -> observations?)

COMMIT; -- End Transaction

-- Note: Removed dblink_disconnect as we removed dblink_connect
