<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('phm_edw.quality_measures', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('description')->nullable();
            $table->string('category');
            $table->timestamps();
        });

        Schema::create('phm_edw.care_gaps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->references('patient_id')->on('phm_edw.patient')->onDelete('cascade');
            $table->foreignId('measure_id')->constrained('phm_edw.quality_measures')->onDelete('cascade');
            $table->enum('status', ['open', 'closed', 'in_progress'])->default('open');
            $table->enum('priority', ['high', 'medium', 'low'])->default('medium');
            $table->date('due_date')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['status', 'priority']);
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('phm_edw.care_gaps');
        Schema::dropIfExists('phm_edw.quality_measures');
    }
};
