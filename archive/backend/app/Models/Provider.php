<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Provider extends Model
{
    use HasFactory;

    protected $table = 'phm_edw.provider';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'first_name',
        'middle_name',
        'last_name',
        'display_name',
        'npi_number',
        'license_number',
        'license_state',
        'dea_number',
        'provider_type',
        'specialty',
        'org_id',
        'primary_phone',
        'email',
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
     * Get the organization that the provider belongs to.
     */
    public function organization()
    {
        return $this->belongsTo(Organization::class, 'org_id');
    }

    /**
     * Get the patients for whom this provider is the PCP.
     */
    public function patients()
    {
        return $this->hasMany(Patient::class, 'pcp_provider_id');
    }

    /**
     * Get the encounters where this provider was the attending.
     */
    public function encounters()
    {
        return $this->hasMany(Encounter::class);
    }

    /**
     * Get the full name of the provider.
     */
    public function getFullNameAttribute(): string
    {
        $parts = array_filter([
            $this->first_name,
            $this->middle_name,
            $this->last_name
        ]);
        return implode(' ', $parts);
    }
}
