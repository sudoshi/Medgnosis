<?php

namespace Database\Seeders;

use App\Models\QualityMeasure;
use App\Models\CareGap;
use App\Models\Patient;
use Illuminate\Database\Seeder;
use Carbon\Carbon;

class QualityMeasureSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create quality measures
        $measures = [
            [
                'name' => 'HbA1c Test',
                'description' => 'Regular HbA1c testing for diabetic patients',
                'category' => 'Diabetes Care',
            ],
            [
                'name' => 'Blood Pressure Check',
                'description' => 'Regular blood pressure monitoring for hypertensive patients',
                'category' => 'Cardiovascular Care',
            ],
            [
                'name' => 'Annual Wellness Visit',
                'description' => 'Yearly comprehensive health assessment',
                'category' => 'Preventive Care',
            ],
            [
                'name' => 'Mammogram Screening',
                'description' => 'Regular mammogram screening for eligible patients',
                'category' => 'Cancer Screening',
            ],
            [
                'name' => 'Colorectal Cancer Screening',
                'description' => 'Regular colorectal cancer screening for eligible patients',
                'category' => 'Cancer Screening',
            ],
        ];

        foreach ($measures as $measure) {
            QualityMeasure::create($measure);
        }

        // Get some random patients
        $patients = Patient::inRandomOrder()->take(10)->get();
        $measures = QualityMeasure::all();
        $now = Carbon::now();

        // Create care gaps
        foreach ($patients as $patient) {
            // Create 1-3 care gaps per patient
            $gapCount = rand(1, 3);
            $selectedMeasures = $measures->random($gapCount);

            foreach ($selectedMeasures as $measure) {
                CareGap::create([
                    'patient_id' => $patient->id,
                    'measure_id' => $measure->id,
                    'status' => 'open',
                    'priority' => ['high', 'medium', 'low'][rand(0, 2)],
                    'due_date' => $now->copy()->addDays(rand(7, 90)),
                    'notes' => 'Follow up required',
                ]);
            }
        }
    }
}
