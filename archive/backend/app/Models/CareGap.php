<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CareGap extends Model
{
    protected $table = 'phm_edw.care_gaps';

    protected $fillable = [
        'patient_id',
        'measure_id',
        'status',
        'priority',
        'due_date',
        'notes',
    ];

    protected $casts = [
        'due_date' => 'date',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function measure(): BelongsTo
    {
        return $this->belongsTo(QualityMeasure::class, 'measure_id');
    }
}
