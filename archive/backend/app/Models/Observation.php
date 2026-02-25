<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Observation extends Model
{
    use HasFactory;

    protected $table = 'phm_edw.observation';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'patient_id',
        'encounter_id',
        'provider_id',
        'observation_datetime',
        'observation_code',
        'observation_desc',
        'value_numeric',
        'value_text',
        'units',
        'reference_range',
        'abnormal_flag',
        'status',
        'comments',
        'active_ind',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'observation_datetime' => 'datetime',
        'value_numeric' => 'decimal:4',
        'effective_start_date' => 'date',
        'effective_end_date' => 'date',
        'created_date' => 'datetime',
        'updated_date' => 'datetime',
    ];

    /**
     * Get the patient associated with this observation.
     */
    public function patient()
    {
        return $this->belongsTo(Patient::class);
    }

    /**
     * Get the encounter associated with this observation.
     */
    public function encounter()
    {
        return $this->belongsTo(Encounter::class);
    }

    /**
     * Get the provider who recorded this observation.
     */
    public function provider()
    {
        return $this->belongsTo(Provider::class);
    }

    /**
     * Get the formatted value with units.
     */
    public function getFormattedValueAttribute(): string
    {
        if ($this->value_numeric !== null) {
            return $this->units ? "{$this->value_numeric} {$this->units}" : (string)$this->value_numeric;
        }
        return $this->value_text ?? '';
    }

    /**
     * Check if the observation is abnormal.
     */
    public function getIsAbnormalAttribute(): bool
    {
        return $this->abnormal_flag === 'Y';
    }

    /**
     * Check if the observation is final.
     */
    public function getIsFinalAttribute(): bool
    {
        return strtoupper($this->status) === 'FINAL';
    }

    /**
     * Scope a query to only include abnormal results.
     */
    public function scopeAbnormal($query)
    {
        return $query->where('abnormal_flag', 'Y');
    }

    /**
     * Scope a query to only include final results.
     */
    public function scopeFinal($query)
    {
        return $query->where('status', 'FINAL');
    }

    /**
     * Scope a query to filter by LOINC code.
     */
    public function scopeByLoincCode($query, string $code)
    {
        return $query->where('observation_code', $code);
    }
}
