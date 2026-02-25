<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Procedure extends Model
{
    use HasFactory;

    protected $table = 'phm_edw.procedure';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'procedure_code',
        'procedure_desc',
        'code_system',
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
     * Get the performed procedures associated with this procedure code.
     */
    public function performedProcedures()
    {
        return $this->hasMany(ProcedurePerformed::class);
    }

    /**
     * Get the formatted procedure code and description.
     */
    public function getDisplayNameAttribute(): string
    {
        return "{$this->procedure_code} - {$this->procedure_desc}";
    }

    /**
     * Scope a query to only include CPT codes.
     */
    public function scopeCpt($query)
    {
        return $query->where('code_system', 'CPT');
    }

    /**
     * Scope a query to only include HCPCS codes.
     */
    public function scopeHcpcs($query)
    {
        return $query->where('code_system', 'HCPCS');
    }

    /**
     * Get all patients who have had this procedure performed.
     */
    public function patients()
    {
        return $this->belongsToMany(Patient::class, 'phm_edw.procedure_performed')
            ->withPivot([
                'procedure_datetime',
                'modifiers',
                'comments'
            ])
            ->withTimestamps('created_date', 'updated_date');
    }

    /**
     * Get all providers who have performed this procedure.
     */
    public function providers()
    {
        return $this->belongsToMany(Provider::class, 'phm_edw.procedure_performed')
            ->withPivot([
                'procedure_datetime',
                'modifiers',
                'comments'
            ])
            ->withTimestamps('created_date', 'updated_date');
    }
}
