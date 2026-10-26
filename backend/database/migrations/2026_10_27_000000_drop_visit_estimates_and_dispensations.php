<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Permanently removes the Treatment Estimate and Dispensing features:
 * visit_estimates, visit_estimate_lines and dispensations are dropped, and the
 * controlled_drug_register.dispensation_id reference goes with the parent table.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('controlled_drug_register', 'dispensation_id')) {
            Schema::table('controlled_drug_register', function (Blueprint $table) {
                $table->dropConstrainedForeignId('dispensation_id');
            });
        }

        Schema::dropIfExists('dispensations');
        Schema::dropIfExists('visit_estimate_lines');
        Schema::dropIfExists('visit_estimates');
    }

    public function down(): void
    {
        if (Schema::hasTable('controlled_drug_register')
            && !Schema::hasColumn('controlled_drug_register', 'dispensation_id')) {
            Schema::table('controlled_drug_register', function (Blueprint $table) {
                $table->foreignId('dispensation_id')->nullable()->constrained('dispensations')->nullOnDelete();
            });
        }
        // Dropped tables are not recreated — the features were removed.
    }
};
