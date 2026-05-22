<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Converts risky CASCADE deletes on customer/pet FKs to SET NULL or RESTRICT
     * to prevent accidental data loss when deleting users or pets.
     */
    public function up(): void
    {
        // pets.customer_id: cascade -> set null (preserve pet records)
        if (Schema::hasTable('pets') && Schema::hasColumn('pets', 'customer_id')) {
            Schema::table('pets', function (Blueprint $table) {
                $table->dropForeign(['customer_id']);
                $table->foreign('customer_id')->references('id')->on('users')->onDelete('set null');
            });
        }

        // boardings.pet_id: cascade -> set null (preserve boarding history)
        if (Schema::hasTable('boardings') && Schema::hasColumn('boardings', 'pet_id')) {
            Schema::table('boardings', function (Blueprint $table) {
                $table->dropForeign(['pet_id']);
                $table->foreign('pet_id')->references('id')->on('pets')->onDelete('set null');
            });
        }

        // boardings.customer_id: cascade -> set null (preserve boarding history)
        if (Schema::hasTable('boardings') && Schema::hasColumn('boardings', 'customer_id')) {
            Schema::table('boardings', function (Blueprint $table) {
                $table->dropForeign(['customer_id']);
                $table->foreign('customer_id')->references('id')->on('users')->onDelete('set null');
            });
        }

        // appointments.customer_id: cascade -> set null
        if (Schema::hasTable('appointments') && Schema::hasColumn('appointments', 'customer_id')) {
            Schema::table('appointments', function (Blueprint $table) {
                $table->dropForeign(['customer_id']);
                $table->foreign('customer_id')->references('id')->on('users')->onDelete('set null');
            });
        }

        // appointments.pet_id: cascade -> set null
        if (Schema::hasTable('appointments') && Schema::hasColumn('appointments', 'pet_id')) {
            Schema::table('appointments', function (Blueprint $table) {
                $table->dropForeign(['pet_id']);
                $table->foreign('pet_id')->references('id')->on('pets')->onDelete('set null');
            });
        }

        // appointments.service_id: cascade -> restrict (prevent deleting referenced services)
        if (Schema::hasTable('appointments') && Schema::hasColumn('appointments', 'service_id')) {
            Schema::table('appointments', function (Blueprint $table) {
                $table->dropForeign(['service_id']);
                $table->foreign('service_id')->references('id')->on('services')->onDelete('restrict');
            });
        }

        // medical_records.pet_id: cascade -> set null (preserve medical audit trail)
        if (Schema::hasTable('medical_records') && Schema::hasColumn('medical_records', 'pet_id')) {
            Schema::table('medical_records', function (Blueprint $table) {
                $table->dropForeign(['pet_id']);
                $table->foreign('pet_id')->references('id')->on('pets')->onDelete('set null');
            });
        }

        // vaccinations.pet_id: cascade -> set null (preserve vaccination history)
        if (Schema::hasTable('vaccinations') && Schema::hasColumn('vaccinations', 'pet_id')) {
            Schema::table('vaccinations', function (Blueprint $table) {
                $table->dropForeign(['pet_id']);
                $table->foreign('pet_id')->references('id')->on('pets')->onDelete('set null');
            });
        }

        // customer_orders.customer_id: cascade -> restrict (block deletion of customers with orders)
        if (Schema::hasTable('customer_orders') && Schema::hasColumn('customer_orders', 'customer_id')) {
            Schema::table('customer_orders', function (Blueprint $table) {
                $table->dropForeign(['customer_id']);
                $table->foreign('customer_id')->references('id')->on('users')->onDelete('restrict');
            });
        }

        // customers.user_id: cascade -> restrict (block deleting users with customer profiles)
        if (Schema::hasTable('customers') && Schema::hasColumn('customers', 'user_id')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->dropForeign(['user_id']);
                $table->foreign('user_id')->references('id')->on('users')->onDelete('restrict');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // pets.customer_id
        if (Schema::hasTable('pets') && Schema::hasColumn('pets', 'customer_id')) {
            Schema::table('pets', function (Blueprint $table) {
                $table->dropForeign(['customer_id']);
                $table->foreign('customer_id')->references('id')->on('users')->onDelete('cascade');
            });
        }

        // boardings.pet_id
        if (Schema::hasTable('boardings') && Schema::hasColumn('boardings', 'pet_id')) {
            Schema::table('boardings', function (Blueprint $table) {
                $table->dropForeign(['pet_id']);
                $table->foreign('pet_id')->references('id')->on('pets')->onDelete('cascade');
            });
        }

        // boardings.customer_id
        if (Schema::hasTable('boardings') && Schema::hasColumn('boardings', 'customer_id')) {
            Schema::table('boardings', function (Blueprint $table) {
                $table->dropForeign(['customer_id']);
                $table->foreign('customer_id')->references('id')->on('users')->onDelete('cascade');
            });
        }

        // appointments.customer_id
        if (Schema::hasTable('appointments') && Schema::hasColumn('appointments', 'customer_id')) {
            Schema::table('appointments', function (Blueprint $table) {
                $table->dropForeign(['customer_id']);
                $table->foreign('customer_id')->references('id')->on('users')->onDelete('cascade');
            });
        }

        // appointments.pet_id
        if (Schema::hasTable('appointments') && Schema::hasColumn('appointments', 'pet_id')) {
            Schema::table('appointments', function (Blueprint $table) {
                $table->dropForeign(['pet_id']);
                $table->foreign('pet_id')->references('id')->on('pets')->onDelete('cascade');
            });
        }

        // appointments.service_id
        if (Schema::hasTable('appointments') && Schema::hasColumn('appointments', 'service_id')) {
            Schema::table('appointments', function (Blueprint $table) {
                $table->dropForeign(['service_id']);
                $table->foreign('service_id')->references('id')->on('services')->onDelete('cascade');
            });
        }

        // medical_records.pet_id
        if (Schema::hasTable('medical_records') && Schema::hasColumn('medical_records', 'pet_id')) {
            Schema::table('medical_records', function (Blueprint $table) {
                $table->dropForeign(['pet_id']);
                $table->foreign('pet_id')->references('id')->on('pets')->onDelete('cascade');
            });
        }

        // vaccinations.pet_id
        if (Schema::hasTable('vaccinations') && Schema::hasColumn('vaccinations', 'pet_id')) {
            Schema::table('vaccinations', function (Blueprint $table) {
                $table->dropForeign(['pet_id']);
                $table->foreign('pet_id')->references('id')->on('pets')->onDelete('cascade');
            });
        }

        // customer_orders.customer_id
        if (Schema::hasTable('customer_orders') && Schema::hasColumn('customer_orders', 'customer_id')) {
            Schema::table('customer_orders', function (Blueprint $table) {
                $table->dropForeign(['customer_id']);
                $table->foreign('customer_id')->references('id')->on('users')->onDelete('cascade');
            });
        }

        // customers.user_id
        if (Schema::hasTable('customers') && Schema::hasColumn('customers', 'user_id')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->dropForeign(['user_id']);
                $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            });
        }
    }
};
