<?php

namespace Tests\Unit\Services;

use App\Services\SyntheaImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SyntheaImportServiceTest extends TestCase
{
    use RefreshDatabase;

    private SyntheaImportService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new SyntheaImportService();
    }

    public function test_can_import_patients_with_limit()
    {
        // Mock Synthea database response
        DB::shouldReceive('connection')
            ->with('synthea')
            ->andReturnSelf()
            ->getMock();

        DB::shouldReceive('table')
            ->with('patients')
            ->andReturnSelf()
            ->getMock();

        DB::shouldReceive('select')
            ->andReturnSelf()
            ->getMock();

        DB::shouldReceive('limit')
            ->with(5)
            ->andReturnSelf()
            ->getMock();

        DB::shouldReceive('get')
            ->andReturn(collect([
                (object)[
                    'id' => '1',
                    'first' => 'John',
                    'last' => 'Doe',
                    'birthdate' => '1970-01-01',
                    'gender' => 'M',
                    'race' => 'White',
                    'ethnicity' => 'Non-Hispanic',
                    'marital' => 'M',
                    'address' => '123 Main St',
                    'city' => 'Boston',
                    'state' => 'MA',
                    'zip' => '02108',
                ],
                (object)[
                    'id' => '2',
                    'first' => 'Jane',
                    'last' => 'Smith',
                    'birthdate' => '1980-06-15',
                    'gender' => 'F',
                    'race' => 'Asian',
                    'ethnicity' => 'Non-Hispanic',
                    'marital' => 'S',
                    'address' => '456 Oak St',
                    'city' => 'Boston',
                    'state' => 'MA',
                    'zip' => '02109',
                ],
            ]));

        // Run import with limit
        $stats = $this->service->importPatients(5);

        // Assert results
        $this->assertEquals(2, $stats['imported']);
        $this->assertEquals(0, $stats['skipped']);
        $this->assertEquals(0, $stats['failed']);

        // Verify data in EDW
        $this->assertDatabaseHas('phm_edw.patient', [
            'first_name' => 'John',
            'last_name' => 'Doe',
            'gender' => 'Male',
        ]);

        $this->assertDatabaseHas('phm_edw.patient', [
            'first_name' => 'Jane',
            'last_name' => 'Smith',
            'gender' => 'Female',
        ]);

        // Verify addresses were created
        $this->assertDatabaseHas('phm_edw.address', [
            'address_line1' => '123 Main St',
            'city' => 'Boston',
            'state' => 'MA',
            'zip' => '02108',
        ]);

        $this->assertDatabaseHas('phm_edw.address', [
            'address_line1' => '456 Oak St',
            'city' => 'Boston',
            'state' => 'MA',
            'zip' => '02109',
        ]);
    }

    public function test_handles_empty_synthea_data()
    {
        // Mock empty Synthea database response
        DB::shouldReceive('connection')
            ->with('synthea')
            ->andReturnSelf()
            ->getMock();

        DB::shouldReceive('table')
            ->with('patients')
            ->andReturnSelf()
            ->getMock();

        DB::shouldReceive('select')
            ->andReturnSelf()
            ->getMock();

        DB::shouldReceive('get')
            ->andReturn(collect([]));

        // Run import
        $stats = $this->service->importPatients();

        // Assert results
        $this->assertEquals(0, $stats['imported']);
        $this->assertEquals(0, $stats['skipped']);
        $this->assertEquals(0, $stats['failed']);

        // Verify no data was imported
        $this->assertDatabaseCount('phm_edw.patient', 0);
        $this->assertDatabaseCount('phm_edw.address', 0);
    }

    public function test_handles_invalid_synthea_data()
    {
        // Mock Synthea database response with invalid data
        DB::shouldReceive('connection')
            ->with('synthea')
            ->andReturnSelf()
            ->getMock();

        DB::shouldReceive('table')
            ->with('patients')
            ->andReturnSelf()
            ->getMock();

        DB::shouldReceive('select')
            ->andReturnSelf()
            ->getMock();

        DB::shouldReceive('get')
            ->andReturn(collect([
                (object)[
                    'id' => '1',
                    // Missing required fields
                    'first' => null,
                    'last' => null,
                    'birthdate' => 'invalid-date',
                ],
            ]));

        // Run import
        $stats = $this->service->importPatients();

        // Assert results
        $this->assertEquals(0, $stats['imported']);
        $this->assertEquals(0, $stats['skipped']);
        $this->assertEquals(1, $stats['failed']);

        // Verify no data was imported
        $this->assertDatabaseCount('phm_edw.patient', 0);
        $this->assertDatabaseCount('phm_edw.address', 0);
    }
}
