<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Dated correction appended to a finalized or locked medical record. Addenda
 * are append-only: there is no update or delete path.
 */
class MedicalRecordAddendum extends Model
{
    protected $table = 'medical_record_addenda';

    protected $fillable = ['medical_record_id', 'author_id', 'body', 'content_hash'];

    public function medicalRecord(): BelongsTo
    {
        return $this->belongsTo(MedicalRecord::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }
}
