<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Retire the legacy vet_appointments table. The active veterinary
     * workflow uses the appointments table exclusively.
     */
    public function up(): void
    {
        // Repoint service_item_usages.appointment_id at the real appointments
        // table. Rows referencing ids that don't exist there are nulled so the
        // new foreign key can be created cleanly.
        if (Schema::hasTable('service_item_usages') && Schema::hasColumn('service_item_usages', 'appointment_id')) {
            DB::table('service_item_usages')
                ->whereNotNull('appointment_id')
                ->whereNotIn('appointment_id', DB::table('appointments')->select('id'))
                ->update(['appointment_id' => null]);

            Schema::table('service_item_usages', function (Blueprint $table) {
                $table->dropForeign(['appointment_id']);
            });

            Schema::table('service_item_usages', function (Blueprint $table) {
                $table->foreign('appointment_id')->references('id')->on('appointments')->nullOnDelete();
            });
        }

        Schema::dropIfExists('vet_appointments');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('vet_appointments')) {
            Schema::create('vet_appointments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('pet_id')->nullable()->constrained('pets')->nullOnDelete();
                $table->string('pet_name');
                $table->string('service');
                $table->date('appointment_date');
                $table->text('concern')->nullable();
                $table->enum('status', ['pending', 'approved', 'rejected', 'completed', 'cancelled'])->default('pending');
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (Schema::hasTable('service_item_usages') && Schema::hasColumn('service_item_usages', 'appointment_id')) {
            DB::table('service_item_usages')
                ->whereNotNull('appointment_id')
                ->whereNotIn('appointment_id', DB::table('vet_appointments')->select('id'))
                ->update(['appointment_id' => null]);

            Schema::table('service_item_usages', function (Blueprint $table) {
                $table->dropForeign(['appointment_id']);
            });

            Schema::table('service_item_usages', function (Blueprint $table) {
                $table->foreign('appointment_id')->references('id')->on('vet_appointments')->nullOnDelete();
            });
        }
    }
};
