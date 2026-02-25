<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Address extends Model
{
    use HasFactory;

    protected $table = 'phm_edw.address';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'address_line1',
        'address_line2',
        'city',
        'state',
        'zip',
        'county',
        'country',
        'latitude',
        'longitude',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'latitude' => 'decimal:6',
        'longitude' => 'decimal:6',
        'effective_start_date' => 'date',
        'effective_end_date' => 'date',
        'created_date' => 'datetime',
        'updated_date' => 'datetime',
    ];

    /**
     * Get the patients associated with this address.
     */
    public function patients()
    {
        return $this->hasMany(Patient::class);
    }

    /**
     * Get the organizations associated with this address.
     */
    public function organizations()
    {
        return $this->hasMany(Organization::class);
    }

    /**
     * Get the full address as a string.
     */
    public function getFullAddressAttribute(): string
    {
        $parts = [
            $this->address_line1,
            $this->address_line2,
            $this->city,
            $this->state,
            $this->zip
        ];

        return implode(', ', array_filter($parts));
    }

    /**
     * Get the geocoding status of the address.
     */
    public function getIsGeocodedAttribute(): bool
    {
        return !is_null($this->latitude) && !is_null($this->longitude);
    }
}
