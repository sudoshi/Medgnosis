<?php

namespace Tests\Unit\Http\Resources;

use App\Http\Resources\PatientResource;
use App\Models\Patient;
use App\Models\Provider;
use App\Models\Address;
use App\Models\ConditionDiagnosis;
use App\Models\Encounter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PatientResourceTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;
    private Provider $provider;
    private Address $address;

    protected function setUp(): void
    {
        parent::setUp();

        // Create test address
        $this->address = Address::create([
            'address_line1' => '123 Main St',
            'address_line2' => 'Apt 4B',
            'city' => 'Boston',
            'state' => 'MA',
            'zip' => '02108',
            'country' => 'USA',
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Create test provider
        $this->provider = Provider::create([
            'first_name' => 'Jane',
            'last_name' => 'Smith',
            'display_name' => 'Dr. Jane Smith',
            'npi_number' => '1234567890',
            'provider_type' => 'MD',
            'specialty' => 'Internal Medicine',
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Create test patient
        $this->patient = Patient::create([
            'first_name' => 'John',
            'middle_name' => 'Robert',
            'last_name' => 'Doe',
            'date_of_birth' => '1960-01-15',
            'gender' => 'Male',
            'race' => 'White',
            'ethnicity' => 'Non-Hispanic',
            'marital_status' => 'Married',
            'primary_language' => 'English',
            'address_id' => $this->address->address_id,
            'pcp_provider_id' => $this->provider->provider_id,
            'primary_phone' => '555-123-4567',
            'email' => 'john.doe@example.com',
            'mrn' => 'MRN123456',
            'ssn' => '123-45-6789',
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Create test encounters
        Encounter::create([
            'patient_id' => $this->patient->patient_id,
            'provider_id' => $this->provider->provider_id,
            'encounter_type' => 'OUTPATIENT',
            'encounter_reason' => 'Follow-up',
            'encounter_datetime' => now()->subDays(30),
            'status' => 'COMPLETED',
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Create test conditions
        ConditionDiagnosis::create([
            'patient_id' => $this->patient->patient_id,
            'provider_id' => $this->provider->provider_id,
            'diagnosis_type' => 'CHRONIC',
            'diagnosis_status' => 'ACTIVE',
            'onset_date' => now()->subYears(2),
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);
    }

    public function test_transforms_patient_data_correctly()
    {
        $resource = new PatientResource($this->patient);
        $array = $resource->toArray(request());

        // Test basic demographics
        $this->assertEquals($this->patient->patient_id, $array['id']);
        $this->assertEquals('John Robert Doe', $array['demographics']['full_name']);
        $this->assertEquals('1960-01-15', $array['demographics']['date_of_birth']);
        $this->assertEquals(64, $array['demographics']['age']);

        // Test contact information
        $this->assertEquals('555-123-4567', $array['contact']['primary_phone']);
        $this->assertEquals('john.doe@example.com', $array['contact']['email']);

        // Test address formatting
        $this->assertEquals([
            'line1' => '123 Main St',
            'line2' => 'Apt 4B',
            'city' => 'Boston',
            'state' => 'MA',
            'zip' => '02108',
            'county' => null,
            'country' => 'USA',
        ], $array['contact']['address']);

        // Test PCP information
        $this->assertEquals([
            'id' => $this->provider->provider_id,
            'name' => 'Dr. Jane Smith',
            'specialty' => 'Internal Medicine',
            'npi' => '1234567890',
        ], $array['care_team']['primary_care_provider']);

        // Test status flags
        $this->assertTrue($array['status']['active']);
        $this->assertNotNull($array['status']['effective_start']);
        $this->assertNull($array['status']['effective_end']);
    }

    public function test_protects_sensitive_data()
    {
        $resource = new PatientResource($this->patient);
        $array = $resource->toArray(request());

        // Test that SSN is only included when user has permission
        $this->assertArrayHasKey('mrn', $array['identifiers']);
        $this->assertArrayHasKey('ssn', $array['identifiers']);
        $this->assertNull($array['identifiers']['ssn']); // Should be null without proper permission
    }

    public function test_includes_clinical_summary()
    {
        $resource = new PatientResource($this->patient);
        $array = $resource->toArray(request());

        // Test encounters
        $this->assertArrayHasKey('recent_encounters', $array['clinical_summary']);
        $this->assertCount(1, $array['clinical_summary']['recent_encounters']);
        $this->assertEquals('OUTPATIENT', $array['clinical_summary']['recent_encounters'][0]['type']);

        // Test conditions
        $this->assertArrayHasKey('conditions', $array['clinical_summary']);
        $this->assertCount(1, $array['clinical_summary']['conditions']);
        $this->assertEquals('CHRONIC', $array['clinical_summary']['conditions'][0]['type']);
        $this->assertEquals('ACTIVE', $array['clinical_summary']['conditions'][0]['status']);
    }

    public function test_includes_additional_data_when_provided()
    {
        $resource = (new PatientResource($this->patient))->additional([
            'risk_score' => [
                'total' => 65.5,
                'factors' => [
                    'age' => 60.0,
                    'conditions' => 70.0,
                ],
            ],
            'care_gaps' => [
                [
                    'measure_name' => 'Diabetes Control',
                    'days_open' => 30,
                ],
            ],
        ]);

        $array = $resource->toArray(request());

        // Test risk assessment
        $this->assertArrayHasKey('risk_assessment', $array);
        $this->assertEquals(65.5, $array['risk_assessment']['total']);

        // Test care gaps
        $this->assertArrayHasKey('care_gaps', $array);
        $this->assertCount(1, $array['care_gaps']);
        $this->assertEquals('Diabetes Control', $array['care_gaps'][0]['measure_name']);
    }
}
