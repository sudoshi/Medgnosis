<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class CreatePhmSchemas extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Read and execute the EDW schema DDL
        $edwDdl = File::get(database_path('phm-edw-ddl.sql'));
        DB::unprepared($edwDdl);

        // Read and execute the Kimball star schema DDL
        $starDdl = File::get(database_path('phm-kimbal-ddl.sql'));
        DB::unprepared($starDdl);

        // Grant permissions to the database user
        $dbUsername = config('database.connections.pgsql.username');
        DB::unprepared("
            GRANT USAGE ON SCHEMA phm_edw TO {$dbUsername};
            GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA phm_edw TO {$dbUsername};
            GRANT USAGE ON ALL SEQUENCES IN SCHEMA phm_edw TO {$dbUsername};

            GRANT USAGE ON SCHEMA phm_star TO {$dbUsername};
            GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA phm_star TO {$dbUsername};
            GRANT USAGE ON ALL SEQUENCES IN SCHEMA phm_star TO {$dbUsername};
        ");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::unprepared('DROP SCHEMA IF EXISTS phm_edw CASCADE;');
        DB::unprepared('DROP SCHEMA IF EXISTS phm_star CASCADE;');
    }
}
