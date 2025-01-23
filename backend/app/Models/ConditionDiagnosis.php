<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ConditionDiagnosis extends Model
{
    use HasFactory;

    protected $table = 'phm_edw.condition_diagnosis';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'patient_id',
        'encounter_id',
        'provider_id',
        'condition_id',
        'diagnosis_type',
        'diagnosis_status',
        'onset_date',
        'resolution_date',
        'primary_indicator',
        'active_ind',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'onset_date' => 'date',
        'resolution_date' => 'date',
        'effective_start_date' => 'date',
        'effective_end_date' => 'date',
        'created_date' => 'datetime',
        'updated_date' => 'datetime',
        'primary_indicator' => 'boolean',
    ];

    /**
     * Get the patient associated with this diagnosis.
     */
    public function patient()
    {
        return $this->belongsTo(Patient::class);
    }

    /**
     * Get the encounter associated with this diagnosis.
     */
    public function encounter()
    {
        return $this->belongsTo(Encounter::class);
    }

    /**
     * Get the provider who made this diagnosis.
     */
    public function provider()
    {
        return $this->belongsTo(Provider::class);
    }

    /**
     * Get the condition (from master table) for this diagnosis.
     */
    public function condition()
    {
        return $this->belongsTo(Condition::class);
    }

    /**
     * Check if this is an active diagnosis.
     */
    public function getIsActiveAttribute(): bool
    {
        return $this->diagnosis_status === 'ACTIVE';
    }

    /**
     * Check if this is a chronic condition.
     */
    public function getIsChronicAttribute(): bool
    {
        return $this->diagnosis_type === 'CHRONIC';
    }

    /**
     * Get the duration of the condition (if resolved).
     */
    public function getDurationInDaysAttribute(): ?int
    {
        if ($this->onset_date && $this->resolution_date) {
            return $this->resolution_date->diffInDays($this->onset_date);
        }
        return null;
    }
}
