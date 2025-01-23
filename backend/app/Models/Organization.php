<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Organization extends Model
{
    use HasFactory;

    protected $table = 'phm_edw.organization';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'organization_name',
        'organization_type',
        'parent_org_id',
        'address_id',
        'primary_phone',
        'secondary_phone',
        'fax',
        'email',
        'website',
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
     * Get the parent organization.
     */
    public function parentOrganization()
    {
        return $this->belongsTo(Organization::class, 'parent_org_id');
    }

    /**
     * Get the child organizations.
     */
    public function childOrganizations()
    {
        return $this->hasMany(Organization::class, 'parent_org_id');
    }

    /**
     * Get the address record associated with the organization.
     */
    public function address()
    {
        return $this->belongsTo(Address::class, 'address_id');
    }

    /**
     * Get the providers associated with this organization.
     */
    public function providers()
    {
        return $this->hasMany(Provider::class, 'org_id');
    }

    /**
     * Get all encounters that occurred at this organization.
     */
    public function encounters()
    {
        return $this->hasMany(Encounter::class, 'org_id');
    }
}
