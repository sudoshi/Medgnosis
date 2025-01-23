<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProcedurePerformed extends Model
{
    use HasFactory;

    protected $table = 'phm_edw.procedure_performed';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'patient_id',
        'encounter_id',
        'provider_id',
        'procedure_id',
        'procedure_datetime',
        'modifiers',
        'comments',
        'active_ind',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'procedure_datetime' => 'datetime',
        'effective_start_date' => 'date',
        'effective_end_date' => 'date',
        'created_date' => 'datetime',
        'updated_date' => 'datetime',
    ];

    /**
     * Get the patient associated with this procedure.
     */
    public function patient()
    {
        return $this->belongsTo(Patient::class);
    }

    /**
     * Get the encounter associated with this procedure.
     */
    public function encounter()
    {
        return $this->belongsTo(Encounter::class);
    }

    /**
     * Get the provider who performed this procedure.
     */
    public function provider()
    {
        return $this->belongsTo(Provider::class);
    }

    /**
     * Get the procedure (from master table) for this performed procedure.
     */
    public function procedure()
    {
        return $this->belongsTo(Procedure::class);
    }

    /**
     * Get the modifier codes as an array.
     */
    public function getModifierArrayAttribute(): array
    {
        if (empty($this->modifiers)) {
            return [];
        }
        return explode(',', $this->modifiers);
    }

    /**
     * Set the modifier codes from an array.
     */
    public function setModifierArrayAttribute(array $value)
    {
        $this->attributes['modifiers'] = implode(',', array_filter($value));
    }
}
