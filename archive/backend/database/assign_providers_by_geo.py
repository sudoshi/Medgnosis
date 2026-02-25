#!/usr/bin/env python3

import psycopg2
import os
from dotenv import load_dotenv
from haversine import haversine, Unit
import sys
from collections import defaultdict
import itertools # For round-robin provider selection

# --- Configuration ---
MAX_PATIENTS_PER_PROVIDER = 380

# --- Load Environment Variables ---
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if not os.path.exists(dotenv_path):
    print(f"Error: .env file not found at expected location: {dotenv_path}")
    print("Please ensure the .env file exists in the 'backend' directory with DB credentials.")
    sys.exit(1)

load_dotenv(dotenv_path=dotenv_path)

DB_NAME = os.getenv("DB_DATABASE")
DB_USER = os.getenv("DB_USERNAME")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

if not all([DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT]):
    print("Error: Database credentials missing in .env file.")
    sys.exit(1)

# --- Database Connection ---
conn = None
cur = None
try:
    conn = psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT
    )
    cur = conn.cursor()
    print("Database connection established.")
except psycopg2.Error as e:
    print(f"Error connecting to database: {e}")
    sys.exit(1)

# --- Helper Functions ---
def get_active_patients(cursor):
    """Fetches active patients with their address details."""
    query = """
    SELECT
        p.patient_id,
        a.latitude,
        a.longitude,
        a.zip
    FROM phm_edw.patient p
    JOIN phm_edw.address a ON p.address_id = a.address_id
    WHERE p.active_ind = 'Y'
      AND p.address_id IS NOT NULL;
    """
    try:
        cursor.execute(query)
        patients = cursor.fetchall()
        patient_data = [
            {'id': row[0], 'lat': row[1], 'lon': row[2], 'zip': row[3]}
            for row in patients
        ]
        print(f"Fetched {len(patient_data)} active patients with addresses.")
        return patient_data
    except psycopg2.Error as e:
        print(f"Error fetching patients: {e}")
        conn.rollback()
        return []

def get_organization_locations(cursor):
    """Fetches organizations with their address details."""
    query = """
    SELECT
        org.org_id,
        a.latitude,
        a.longitude,
        a.zip
    FROM phm_edw.organization org
    JOIN phm_edw.address a ON org.address_id = a.address_id
    WHERE org.address_id IS NOT NULL;
    """
    try:
        cursor.execute(query)
        orgs = cursor.fetchall()
        org_data = [
            {'id': row[0], 'lat': row[1], 'lon': row[2], 'zip': row[3]}
            for row in orgs
        ]
        print(f"Fetched {len(org_data)} organizations with addresses.")
        return org_data
    except psycopg2.Error as e:
        print(f"Error fetching organizations: {e}")
        conn.rollback()
        return []

def get_active_provider_ids(cursor):
    """Fetches IDs of all active providers."""
    query = "SELECT provider_id FROM phm_edw.provider WHERE active_ind = 'Y';"
    try:
        cursor.execute(query)
        provider_ids = [row[0] for row in cursor.fetchall()]
        print(f"Fetched {len(provider_ids)} active provider IDs.")
        return provider_ids
    except psycopg2.Error as e:
        print(f"Error fetching active provider IDs: {e}")
        conn.rollback()
        return []

# --- Main Logic ---
try:
    patients = get_active_patients(cur)
    organizations = get_organization_locations(cur)
    active_provider_ids = get_active_provider_ids(cur)

    if not patients or not organizations or not active_provider_ids:
        print("Missing required data (patients, organizations with addresses, or active providers). Exiting.")
        if not patients: print("- No active patients with addresses found.")
        if not organizations: print("- No organizations with addresses found.")
        if not active_provider_ids: print("- No active providers found.")
        sys.exit(0)

    provider_load = defaultdict(int)
    patient_assignments = {}
    unassigned_patients = []

    # Separate organizations by data availability
    orgs_with_latlon = [org for org in organizations if org['lat'] is not None and org['lon'] is not None]
    orgs_by_zip = defaultdict(list)
    for org in organizations:
        if org['zip']:
            orgs_by_zip[org['zip']].append(org)

    # Create a round-robin iterator for active providers
    provider_iterator = itertools.cycle(active_provider_ids)
    # Keep track of providers checked in a full cycle to detect when none are available
    providers_checked_in_cycle = set()

    print(f"\nProcessing {len(patients)} patients...")
    processed_count = 0
    for patient in patients:
        processed_count += 1
        if processed_count % 500 == 0: # Adjusted print frequency
            print(f"  Processed {processed_count}/{len(patients)} patients...")

        assigned = False
        patient_loc = (patient['lat'], patient['lon']) if patient['lat'] is not None and patient['lon'] is not None else None
        patient_zip = patient['zip']
        nearest_org_found = False

        # 1. Find nearest organization by Latitude/Longitude
        if patient_loc and orgs_with_latlon:
            distances = []
            for org in orgs_with_latlon:
                org_loc = (org['lat'], org['lon'])
                distance = haversine(patient_loc, org_loc, unit=Unit.MILES)
                distances.append({'org_id': org['id'], 'distance': distance})

            if distances:
                distances.sort(key=lambda x: x['distance'])
                # nearest_org_id = distances[0]['org_id'] # We don't strictly need the ID now
                nearest_org_found = True

        # 2. Find nearest organization by ZIP code (if not found by distance or patient lacks lat/lon)
        if not nearest_org_found and patient_zip and patient_zip in orgs_by_zip:
            # Any org in the same zip counts as "nearest" for this logic
            nearest_org_found = True

        # 3. Assign an available active provider (if a nearest org was conceptually found)
        if nearest_org_found:
            # Try to find an active provider under the cap using round-robin
            initial_provider_cycle_count = len(providers_checked_in_cycle)
            while len(providers_checked_in_cycle) < len(active_provider_ids):
                potential_provider_id = next(provider_iterator)
                providers_checked_in_cycle.add(potential_provider_id)

                if provider_load[potential_provider_id] < MAX_PATIENTS_PER_PROVIDER:
                    # Assign this provider
                    patient_assignments[patient['id']] = potential_provider_id
                    provider_load[potential_provider_id] += 1
                    assigned = True
                    providers_checked_in_cycle.clear() # Reset for next patient
                    break # Move to next patient

            # If we completed a full cycle without finding a provider under the cap
            if not assigned:
                 providers_checked_in_cycle.clear() # Reset for next patient anyway
                 # print(f"  Patient {patient['id']} found nearest org, but no active provider under cap available.")


        if not assigned:
            unassigned_patients.append(patient['id'])
            # print(f"  Could not assign patient {patient['id']} (nearest org found: {nearest_org_found})")

    print(f"\nAssignment phase complete. {len(patient_assignments)} patients assigned.")
    print(f"{len(unassigned_patients)} patients could not be assigned.")

    # --- Update Database ---
    if patient_assignments:
        print("\nUpdating patient records in the database...")
        update_count = 0
        update_errors = 0
        try:
            # Use executemany for potential efficiency
            update_data = list(patient_assignments.items())
            update_query = "UPDATE phm_edw.patient SET pcp_provider_id = %s WHERE patient_id = %s"

            # Reorder data for executemany: list of (provider_id, patient_id) tuples
            update_tuples = [(prov_id, pat_id) for pat_id, prov_id in update_data]

            # Execute in batches if needed, though psycopg2 might handle large ones
            # For simplicity, executing all at once here. Consider batching for very large datasets.
            cur.executemany(update_query, update_tuples)
            update_count = len(update_tuples)

            conn.commit()
            print(f"Successfully updated {update_count} patient records.")
        except psycopg2.Error as e:
            print(f"Error updating database: {e}")
            conn.rollback()
            # Cannot easily determine partial success with executemany rollback
            update_errors = len(patient_assignments)
            update_count = 0
            print("Database transaction rolled back due to error.")
        finally:
             print(f"Database update summary: Attempted={len(patient_assignments)}, Success={update_count}, Errors={update_errors}.")

    else:
        print("\nNo assignments made, skipping database update.")

    # --- Final Report ---
    print("\n--- Final Provider Load ---")
    assigned_provider_count = 0
    providers_at_max = 0

    # Sort providers by ID for consistent reporting
    sorted_provider_ids = sorted([pid for pid, count in provider_load.items() if count > 0])

    for provider_id in sorted_provider_ids:
        count = provider_load[provider_id]
        print(f"Provider ID {provider_id}: {count} patients")
        assigned_provider_count += 1
        if count == MAX_PATIENTS_PER_PROVIDER:
            providers_at_max += 1

    print("\n--- Summary ---")
    print(f"Total Patients Processed: {len(patients)}")
    print(f"Total Patients Assigned: {len(patient_assignments)}")
    print(f"Total Patients Unassigned: {len(unassigned_patients)}")
    print(f"Total Providers Assigned Patients: {assigned_provider_count} / {len(active_provider_ids)}")
    print(f"Providers Reaching Max ({MAX_PATIENTS_PER_PROVIDER}): {providers_at_max}")

    if unassigned_patients:
        print(f"\nUnassigned Patient IDs ({len(unassigned_patients)}):")
        # Print only a sample if too many
        if len(unassigned_patients) > 50:
            print(unassigned_patients[:50], "...")
        else:
            print(unassigned_patients)


except Exception as e:
    print(f"\nAn unexpected error occurred: {e}")
    import traceback
    traceback.print_exc() # Print full traceback for debugging
    if conn:
        conn.rollback()
finally:
    # --- Close Connection ---
    if cur:
        cur.close()
    if conn:
        conn.close()
        print("\nDatabase connection closed.")

print("\nScript finished.")
