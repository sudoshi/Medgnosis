import subprocess
import sys
import re
import signal
import os
import time
import datetime
from typing import List, Tuple, Optional

# --- Configuration ---
DB_NAME = "medgnosis"
DB_USER = "postgres"
DB_PASSWORD = "acumenus"  # Be cautious about hardcoding passwords
SQL_SCRIPT_PATH = "backend/database/ETL_Refresh_Full.sql" # Updated script path

# Expected order of DML/DDL operations based on ETL_Refresh_Full.sql
# Format: (Operation Type, Target Table/Step Description)
# This helps map psql output messages to logical steps.
# NOTE: This relies heavily on the exact sequence of operations in the SQL.
OPERATION_ORDER: List[Tuple[str, str]] = [
    # Step 2: DimOrganization
    ("UPDATE", "dim_organization (SCD Type 2 - Close Old)"),
    ("INSERT", "dim_organization (SCD Type 2 - Insert New/Changed)"),
    # Step 3: DimProvider
    ("UPDATE", "dim_provider (SCD Type 2 - Close Old)"),
    ("INSERT", "dim_provider (SCD Type 2 - Insert New/Changed)"),
    # Step 4: DimPatient
    ("UPDATE", "dim_patient (SCD Type 2 - Close Old)"),
    ("INSERT", "dim_patient (SCD Type 2 - Insert New/Changed)"),
    # Step 5: DimCondition
    ("TRUNCATE", "dim_condition"),
    ("INSERT", "dim_condition (Type 1 Load)"),
    # Step 6: DimProcedure
    ("TRUNCATE", "dim_procedure"),
    ("INSERT", "dim_procedure (Type 1 Load)"),
    # Step 7: DimMedication
    ("TRUNCATE", "dim_medication"),
    ("INSERT", "dim_medication (Type 1 Load)"),
    # Step 8: DimMeasure
    ("TRUNCATE", "dim_measure"),
    ("INSERT", "dim_measure (Type 1 Load)"),
    # Step 9: FactEncounter
    ("INSERT", "fact_encounter (Incremental Load)"),
    # Step 10: FactDiagnosis
    ("INSERT", "fact_diagnosis (Incremental Load)"),
    # Step 11: FactProcedure
    ("INSERT", "fact_procedure (Incremental Load)"),
    # Step 12: FactMedicationOrder
    ("INSERT", "fact_medication_order (Incremental Load)"),
    # Step 13: FactObservation
    ("INSERT", "fact_observation (Incremental Load)"),
    # Step 14: FactCareGap
    ("INSERT", "fact_care_gap (Incremental Load)"),
]
# --- End Configuration ---

# Global variable to hold the subprocess
psql_process: Optional[subprocess.Popen] = None

def signal_handler(sig, frame):
    """Handles Ctrl+C interruption."""
    print("\nStopping ETL process...")
    if psql_process:
        try:
            print("Attempting to terminate psql...")
            psql_process.terminate()  # Try graceful termination first
            time.sleep(1)
            if psql_process.poll() is None: # Check if still running
                 print("psql did not terminate, killing...")
                 psql_process.kill() # Force kill if terminate didn't work
            print("psql process stopped.")
        except Exception as e:
            print(f"Error stopping psql process: {e}")
    sys.exit(1)

def run_etl():
    """Runs the ETL script using psql and monitors its output."""
    global psql_process

    # Set environment variable for password
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASSWORD

    command = [
        "psql",
        "-U", DB_USER,
        "-d", DB_NAME,
        "-v", "ON_ERROR_STOP=1", # Stop script on first error
        "-f", SQL_SCRIPT_PATH
    ]

    print(f"Starting ETL script: {SQL_SCRIPT_PATH}")
    print(f"Command: {' '.join(command)} (Password hidden)")
    print("-" * 40)

    overall_start_time = datetime.datetime.now()
    step_start_time = overall_start_time

    try:
        # Start the psql process
        psql_process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, # Redirect stderr to stdout
            text=True,
            encoding='utf-8',
            env=env,
            bufsize=1 # Line buffered
        )

        operation_index = 0
        in_transaction = False
        error_occurred = False

        # Process output line by line
        while True:
            line = psql_process.stdout.readline()
            if not line and psql_process.poll() is not None:
                break # Process finished

            line = line.strip()
            if not line:
                continue

            current_time = datetime.datetime.now()
            step_elapsed = current_time - step_start_time
            operation_handled = False

            # --- Parse Output ---
            if line == "BEGIN":
                print(f"[{step_elapsed}] BEGIN: Transaction started.")
                in_transaction = True
                step_start_time = current_time # Reset timer for first step
                operation_handled = True
            elif line.startswith("TRUNCATE TABLE"):
                try:
                    # Extract table name if possible (simple split)
                    parts = line.split(" ")
                    table_name = parts[2] if len(parts) > 2 else "Unknown Table"
                    expected_op, expected_desc = OPERATION_ORDER[operation_index] if operation_index < len(OPERATION_ORDER) else ("?", "?")
                    if expected_op == "TRUNCATE":
                         print(f"[{step_elapsed}] STEP {operation_index + 1}: TRUNCATE {table_name} ({expected_desc})")
                         operation_index += 1
                    else:
                         print(f"[{step_elapsed}] UNEXPECTED TRUNCATE: {table_name} (Expected: {expected_op} {expected_desc})")
                    step_start_time = current_time
                    operation_handled = True
                except Exception as e:
                    print(f"[{step_elapsed}] INFO: Error parsing TRUNCATE: {line} ({e})")

            elif line.startswith("INSERT 0 ") or line.startswith("UPDATE "):
                try:
                    parts = line.split(" ")
                    op_type = parts[0]
                    rows_affected = int(parts[2]) if op_type == "INSERT" else int(parts[1])
                    expected_op, expected_desc = OPERATION_ORDER[operation_index] if operation_index < len(OPERATION_ORDER) else ("?", "?")

                    if expected_op == op_type:
                        print(f"[{step_elapsed}] STEP {operation_index + 1}: {op_type} {rows_affected:>9} rows ({expected_desc})")
                        operation_index += 1
                    else:
                         # Handle potential 0-row updates that don't advance the index
                         if op_type == "UPDATE" and rows_affected == 0 and expected_op == "UPDATE":
                             print(f"[{step_elapsed}] STEP {operation_index + 1}: {op_type} {rows_affected:>9} rows ({expected_desc}) - No changes detected.")
                             # Don't increment index yet, wait for corresponding INSERT
                         else:
                             print(f"[{step_elapsed}] UNEXPECTED {op_type}: {rows_affected} rows (Expected: {expected_op} {expected_desc})")
                             # Try to find the next matching operation type if sequence is off
                             found_match = False
                             for i in range(operation_index + 1, len(OPERATION_ORDER)):
                                 if OPERATION_ORDER[i][0] == op_type:
                                     print(f"[{step_elapsed}] Attempting to sync: Jumping to step {i + 1}")
                                     operation_index = i + 1
                                     found_match = True
                                     break
                             if not found_match:
                                 operation_index += 1 # Increment anyway to avoid getting stuck

                    step_start_time = current_time
                    operation_handled = True
                except Exception as e:
                    print(f"[{step_elapsed}] INFO: Error parsing {line.split(' ')[0]}: {line} ({e})")

            elif line == "COMMIT":
                print(f"[{step_elapsed}] COMMIT: Transaction committed successfully.")
                in_transaction = False
                operation_handled = True
            elif line == "ROLLBACK":
                print(f"[{step_elapsed}] ROLLBACK: Transaction rolled back due to error.")
                in_transaction = False
                error_occurred = True
                operation_handled = True
            elif line.startswith("ERROR:") or "ERROR:" in line:
                 print(f"[{step_elapsed}] ERROR:   {line}")
                 error_occurred = True
                 # Don't mark as handled, let it fall through to INFO if needed
            elif line.startswith("NOTICE:") or line.startswith("WARNING:"):
                 print(f"[{step_elapsed}] NOTICE:  {line}")
                 operation_handled = True # Usually not critical, treat as handled
            elif line.startswith("psql:") and "ERROR:" in line:
                 # Catch errors reported directly by psql before transaction starts
                 print(f"[{step_elapsed}] PSQL_ERROR: {line}")
                 error_occurred = True
                 break # Stop processing on psql error
            # else:
                # Optionally print other lines for debugging, but can be noisy
                # if not operation_handled:
                #    print(f"[{step_elapsed}] INFO:    {line}")

        # Wait for the process to finish and get the return code
        return_code = psql_process.wait()
        psql_process = None # Clear global var

        overall_elapsed = datetime.datetime.now() - overall_start_time
        print("-" * 40)

        if return_code == 0 and not error_occurred:
            print(f"ETL script completed successfully in {overall_elapsed}.")
        elif error_occurred:
             print(f"ETL script failed with errors in {overall_elapsed} (see output above).")
        else:
            print(f"ETL script exited with code {return_code} after {overall_elapsed}.")

    except FileNotFoundError:
        print(f"Error: psql command not found. Is PostgreSQL client installed and in PATH?")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
    finally:
        # Ensure process is cleaned up if it's still running somehow
        if psql_process and psql_process.poll() is None:
            print("Cleaning up lingering psql process...")
            psql_process.kill()

if __name__ == "__main__":
    # Register the signal handler for Ctrl+C
    signal.signal(signal.SIGINT, signal_handler)
    run_etl()
