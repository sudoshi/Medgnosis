<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('phm_edw.patient', function (Blueprint $table) {
            $table->decimal('risk_score', 5, 2)->nullable()->after('date_of_birth');
            $table->index('risk_score');
        });

        // Update existing patients with random risk scores
        DB::table('phm_edw.patient')->update([
            'risk_score' => DB::raw('ROUND(CAST(RANDOM() * (100 - 30) + 30 AS NUMERIC), 2)'), // Random score between 30 and 100
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('phm_edw.patient', function (Blueprint $table) {
            $table->dropColumn('risk_score');
        });
    }
};
