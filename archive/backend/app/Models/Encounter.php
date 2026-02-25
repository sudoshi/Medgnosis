<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Encounter extends Model
{
    use HasFactory;

    protected $table = 'phm_edw.encounter';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'patient_id',
        'provider_id',
        'org_id',
        'encounter_number',
        'encounter_type',
        'encounter_reason',
        'admission_datetime',
        'discharge_datetime',
        'encounter_datetime',
        'disposition',
        'status',
        'active_ind',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'admission_datetime' => 'datetime',
        'discharge_datetime' => 'datetime',
        'encounter_datetime' => 'datetime',
        'effective_start_date' => 'date',
        'effective_end_date' => 'date',
        'created_date' => 'datetime',
        'updated_date' => 'datetime',
    ];

    /**
     * Get the patient that owns the encounter.
     */
    public function patient()
    {
        return $this->belongsTo(Patient::class);
    }

    /**
     * Get the provider associated with the encounter.
     */
    public function provider()
    {
        return $this->belongsTo(Provider::class);
    }

    /**
     * Get the organization where the encounter occurred.
     */
    public function organization()
    {
        return $this->belongsTo(Organization::class, 'org_id');
    }

    /**
     * Get the diagnoses associated with this encounter.
     */
    public function diagnoses()
    {
        return $this->hasMany(ConditionDiagnosis::class);
    }

    /**
     * Get the procedures performed during this encounter.
     */
    public function procedures()
    {
        return $this->hasMany(ProcedurePerformed::class);
    }

    /**
     * Get the observations recorded during this encounter.
     */
    public function observations()
    {
        return $this->hasMany(Observation::class);
    }

    /**
     * Get the length of stay for inpatient encounters.
     */
    public function getLengthOfStayAttribute(): ?int
    {
        if ($this->admission_datetime && $this->discharge_datetime) {
            return $this->discharge_datetime->diffInDays($this->admission_datetime);
        }
        return null;
    }

    /**
     * Determine if this is an inpatient encounter.
     */
    public function getIsInpatientAttribute(): bool
    {
        return strtoupper($this->encounter_type) === 'INPATIENT';
    }
}
