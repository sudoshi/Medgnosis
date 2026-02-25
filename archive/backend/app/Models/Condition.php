<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Condition extends Model
{
    use HasFactory;

    protected $table = 'phm_edw.condition';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'condition_code',
        'condition_name',
        'code_system',
        'description',
        'active_ind',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'effective_start_date' => 'date',
        'effective_end_date' => 'date',
        'created_date' => 'datetime',
        'updated_date' => 'datetime',
    ];

    /**
     * Get the diagnoses associated with this condition.
     */
    public function diagnoses()
    {
        return $this->hasMany(ConditionDiagnosis::class);
    }

    /**
     * Get the formatted condition code and name.
     */
    public function getDisplayNameAttribute(): string
    {
        return "{$this->condition_code} - {$this->condition_name}";
    }

    /**
     * Scope a query to only include ICD-10 codes.
     */
    public function scopeIcd10($query)
    {
        return $query->where('code_system', 'ICD-10');
    }

    /**
     * Scope a query to only include SNOMED codes.
     */
    public function scopeSnomed($query)
    {
        return $query->where('code_system', 'SNOMED');
    }

    /**
     * Get all patients who have been diagnosed with this condition.
     */
    public function patients()
    {
        return $this->belongsToMany(Patient::class, 'phm_edw.condition_diagnosis')
            ->withPivot([
                'diagnosis_type',
                'diagnosis_status',
                'onset_date',
                'resolution_date',
                'primary_indicator'
            ])
            ->withTimestamps('created_date', 'updated_date');
    }
}
