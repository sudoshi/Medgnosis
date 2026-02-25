<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QualityMeasure extends Model
{
    protected $table = 'phm_edw.quality_measures';

    protected $fillable = [
        'name',
        'description',
        'category',
    ];

    public function careGaps(): HasMany
    {
        return $this->hasMany(CareGap::class, 'measure_id');
    }
}
