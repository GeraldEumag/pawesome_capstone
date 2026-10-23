<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase D — pharmacy, controlled drugs, vaccinations, ward beds and the
 * confinement status redesign.
 *
 * New tables:
 *   dispensations                    — take-home medication dispensing
 *   controlled_drug_register         — append-only running-balance register
 *   controlled_drug_counts           — weekly two-person physical counts
 *   ward_beds                        — inpatient ward beds (separate from
 *                                      hotel_rooms boarding rooms)
 *   medication_administration_records— MAR for confined patients
 *   confinement_status_rollback_map  — exact rollback for the status rewrite
 *
 * Altered tables:
 *   inventory_items    + item_class (consumable|medicine|vaccine|retail|controlled_drug)
 *   vaccinations       + inventory_batch_id, vaccine_expiry_date
 *   medical_confinements + ward_bed_id, care_level, consent_id, deposit_amount,
 *                        daily_rate, last_accrual_at, discharge_outcome,
 *                        manager-override release columns; status rewritten to
 *                        the new lifecycle
 *   inventory_monthly_audits + approval_status, approved_by, approved_at
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->string('item_class', 30)->default('retail')->after('category')->index();
        });

        // Backfill sensible classes from existing flags.
        DB::table('inventory_items')->where('is_service_consumable', true)->update(['item_class' => 'consumable']);

        Schema::create('ward_beds', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('ward', 40)->default('general'); // general|icu|isolation|recovery
            $table->boolean('is_isolation')->default(false);
            $table->decimal('daily_rate', 10, 2)->default(0);
            $table->string('status', 30)->default('available'); // available|occupied|cleaning|maintenance
            $table->string('notes')->nullable();
            $table->timestamps();
        });

        Schema::table('medical_confinements', function (Blueprint $table) {
            $table->foreignId('ward_bed_id')->nullable()->after('room_id')->constrained('ward_beds')->nullOnDelete();
            $table->string('care_level', 30)->default('observation')->after('urgency_level'); // observation|treatment|critical
            $table->foreignId('consent_id')->nullable()->after('care_level')->constrained('visit_consents')->nullOnDelete();
            $table->decimal('deposit_amount', 10, 2)->default(0)->after('estimated_cost');
            $table->decimal('daily_rate', 10, 2)->nullable()->after('deposit_amount');
            $table->timestamp('last_accrual_at')->nullable()->after('daily_rate');
            $table->string('discharge_outcome', 40)->nullable()->after('discharged_at'); // discharged|transferred|deceased
            $table->foreignId('override_by')->nullable()->after('discharge_outcome')->constrained('users')->nullOnDelete();
            $table->string('override_reason')->nullable()->after('override_by');
            $table->timestamp('override_at')->nullable()->after('override_reason');
        });

        Schema::create('dispensations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prescription_id')->nullable()->constrained('prescriptions')->nullOnDelete();
            $table->foreignId('inventory_item_id')->constrained('inventory_items');
            $table->foreignId('inventory_batch_id')->nullable()->constrained('inventory_batches')->nullOnDelete();
            $table->foreignId('appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->foreignId('medical_confinement_id')->nullable()->constrained('medical_confinements')->nullOnDelete();
            $table->foreignId('pet_id')->nullable()->constrained('pets')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->unsignedInteger('quantity');
            $table->string('unit', 30)->default('pcs');
            $table->string('label_text', 500)->nullable();
            $table->text('directions')->nullable();
            $table->foreignId('dispensed_by')->constrained('users');
            $table->timestamp('counselled_at')->nullable();
            $table->foreignId('counselled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 30)->default('dispensed'); // dispensed|returned|cancelled
            $table->timestamps();
            $table->index(['inventory_item_id', 'status']);
            $table->index('appointment_id');
        });

        Schema::create('controlled_drug_register', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained('inventory_items');
            $table->foreignId('inventory_batch_id')->nullable()->constrained('inventory_batches')->nullOnDelete();
            $table->foreignId('dispensation_id')->nullable()->constrained('dispensations')->nullOnDelete();
            $table->foreignId('mar_id')->nullable();
            $table->foreignId('prescription_id')->nullable()->constrained('prescriptions')->nullOnDelete();
            $table->foreignId('appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->foreignId('medical_confinement_id')->nullable()->constrained('medical_confinements')->nullOnDelete();
            $table->foreignId('pet_id')->nullable()->constrained('pets')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('prescriber_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('performed_by')->constrained('users');
            $table->foreignId('witness_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('entry_type', 30); // received|dispensed|administered|returned|wastage|count_correction
            $table->integer('quantity_delta'); // signed
            $table->integer('balance_after');
            $table->string('notes', 500)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['inventory_item_id', 'created_at']);
        });

        Schema::create('controlled_drug_counts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained('inventory_items');
            $table->integer('expected_balance');
            $table->integer('counted_balance');
            $table->integer('variance');
            $table->string('reason', 500)->nullable();
            $table->foreignId('counted_by')->constrained('users');
            $table->foreignId('witnessed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 30)->default('pending_witness'); // pending_witness|verified|disputed
            $table->date('week_of');
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();
            $table->index(['inventory_item_id', 'week_of']);
        });

        Schema::table('vaccinations', function (Blueprint $table) {
            $table->foreignId('inventory_batch_id')->nullable()->after('lot_number')->constrained('inventory_batches')->nullOnDelete();
            $table->date('vaccine_expiry_date')->nullable()->after('inventory_batch_id');
        });

        Schema::create('medication_administration_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('medical_confinement_id')->constrained('medical_confinements')->cascadeOnDelete();
            $table->foreignId('prescription_id')->nullable()->constrained('prescriptions')->nullOnDelete();
            $table->foreignId('inventory_item_id')->nullable()->constrained('inventory_items')->nullOnDelete();
            $table->foreignId('inventory_batch_id')->nullable()->constrained('inventory_batches')->nullOnDelete();
            $table->string('medication_name');
            $table->string('dose')->nullable();
            $table->string('route')->nullable();
            $table->timestamp('scheduled_at')->nullable();
            $table->string('status', 30)->default('scheduled'); // scheduled|administered|skipped|held
            $table->timestamp('administered_at')->nullable();
            $table->foreignId('administered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['medical_confinement_id', 'status'], 'mar_confinement_status_index');
        });

        Schema::table('controlled_drug_register', function (Blueprint $table) {
            $table->foreign('mar_id')->references('id')->on('medication_administration_records')->nullOnDelete();
        });

        Schema::table('inventory_monthly_audits', function (Blueprint $table) {
            $table->string('approval_status', 30)->default('auto_approved')->after('status'); // auto_approved|pending|approved|rejected
            $table->foreignId('approved_by')->nullable()->after('checked_by')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');
        });

        // Rewrite confinement statuses to the new lifecycle, keeping an exact
        // rollback map like Phase B's appointment status migration.
        Schema::create('confinement_status_rollback_map', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('confinement_id');
            $table->string('old_status', 40);
            $table->string('new_status', 40);
            $table->string('old_care_level', 40)->nullable();
            $table->timestamps();
            $table->unique('confinement_id');
        });

        $map = [
            'approved_for_admission' => 'bed_assigned',
            'under_observation' => 'under_care',
            'under_treatment' => 'under_care',
            'completed' => 'discharged',
        ];
        $care = [
            'under_observation' => 'observation',
            'under_treatment' => 'treatment',
        ];

        foreach (DB::table('medical_confinements')->get(['id', 'status']) as $row) {
            $old = $row->status;
            $new = $map[$old] ?? $old;
            DB::table('confinement_status_rollback_map')->insert([
                'confinement_id' => $row->id,
                'old_status' => $old,
                'new_status' => $new,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            if ($new !== $old || isset($care[$old])) {
                DB::table('medical_confinements')->where('id', $row->id)->update([
                    'status' => $new,
                    'care_level' => $care[$old] ?? 'observation',
                ]);
            }
        }
    }

    public function down(): void
    {
        foreach (DB::table('confinement_status_rollback_map')->get() as $row) {
            DB::table('medical_confinements')->where('id', $row->confinement_id)
                ->update(['status' => $row->old_status]);
        }
        Schema::dropIfExists('confinement_status_rollback_map');

        Schema::table('inventory_monthly_audits', function (Blueprint $table) {
            $table->dropConstrainedForeignId('approved_by');
            $table->dropColumn(['approval_status', 'approved_at']);
        });
        Schema::table('controlled_drug_register', function (Blueprint $table) {
            $table->dropForeign(['mar_id']);
        });
        Schema::dropIfExists('medication_administration_records');
        Schema::table('vaccinations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('inventory_batch_id');
            $table->dropColumn('vaccine_expiry_date');
        });
        Schema::dropIfExists('controlled_drug_counts');
        Schema::dropIfExists('controlled_drug_register');
        Schema::dropIfExists('dispensations');
        Schema::table('medical_confinements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ward_bed_id');
            $table->dropConstrainedForeignId('consent_id');
            $table->dropConstrainedForeignId('override_by');
            $table->dropColumn([
                'care_level', 'deposit_amount', 'daily_rate', 'last_accrual_at',
                'discharge_outcome', 'override_reason', 'override_at',
            ]);
        });
        Schema::dropIfExists('ward_beds');
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropIndex(['item_class']);
            $table->dropColumn('item_class');
        });
    }
};
