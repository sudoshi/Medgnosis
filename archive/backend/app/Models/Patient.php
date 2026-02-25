<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class Patient extends Model
{
    use HasFactory;

    protected $table = 'phm_edw.patient';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'mrn',
        'first_name',
        'middle_name',
        'last_name',
        'date_of_birth',
        'gender',
        'race',
        'ethnicity',
        'marital_status',
        'primary_language',
        'address_id',
        'pcp_provider_id',
        'primary_phone',
        'email',
        'next_of_kin_name',
        'next_of_kin_phone',
        'active_ind',
        'risk_score',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'date_of_birth' => 'date',
        'effective_start_date' => 'date',
        'effective_end_date' => 'date',
        'created_date' => 'datetime',
        'updated_date' => 'datetime',
        'risk_score' => 'decimal:2',
    ];

    /**
     * The attributes that should be encrypted.
     *
     * @var array<int, string>
     */
    protected $encrypted = [
        'ssn',
        'mrn',
    ];

    /**
     * Get the primary care provider associated with the patient.
     */
    public function primaryCareProvider()
    {
        return $this->belongsTo(Provider::class, 'pcp_provider_id');
    }

    /**
     * Get the address record associated with the patient.
     */
    public function address()
    {
        return $this->belongsTo(Address::class, 'address_id');
    }

    /**
     * Get the encounters for the patient.
     */
    public function encounters()
    {
        return $this->hasMany(Encounter::class);
    }

    /**
     * Get the conditions/diagnoses for the patient.
     */
    public function conditions()
    {
        return $this->hasMany(ConditionDiagnosis::class);
    }

    /**
     * Get the observations for the patient.
     */
    public function observations()
    {
        return $this->hasMany(Observation::class);
    }

    /**
     * Get the care gaps for the patient.
     */
    public function careGaps()
    {
        return $this->hasMany(CareGap::class);
    }

    /**
     * Encrypt sensitive attributes before saving
     */
    public function setAttribute($key, $value)
    {
        if (in_array($key, $this->encrypted) && !empty($value)) {
            $value = Crypt::encryptString($value);
        }

        return parent::setAttribute($key, $value);
    }

    /**
     * Decrypt sensitive attributes when accessing
     */
    public function getAttribute($key)
    {
        $value = parent::getAttribute($key);

        if (in_array($key, $this->encrypted) && !empty($value)) {
            try {
                return Crypt::decryptString($value);
            } catch (\Exception $e) {
                return $value;
            }
        }

        return $value;
    }
}
