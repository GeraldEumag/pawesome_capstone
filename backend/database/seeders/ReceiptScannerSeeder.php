<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ReceiptScannerSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('provider_configs')->updateOrInsert(
            ['provider' => 'gcash'],
            [
                'reference_pattern' => '^[A-Z0-9]{10,13}$',
                'min_length' => 10,
                'max_length' => 13,
                'reference_labels' => json_encode(['Ref No.', 'Ref. No.', 'Reference No.', 'Ref No']),
                'accepted_status_texts' => json_encode(['sent', 'paid', 'successful', 'success', 'completed', 'transferred']),
                'confusion_map' => json_encode(['O' => '0', 'I' => '1', 'L' => '1', 'S' => '5']),
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('provider_configs')->updateOrInsert(
            ['provider' => 'maya'],
            [
                // Maya Payment IDs may be hexadecimal — alnum, no auto
                // character-confusion mapping (flag for review instead).
                'reference_pattern' => '^[A-Z0-9]{6,32}$',
                'min_length' => 6,
                'max_length' => 32,
                'reference_labels' => json_encode(['Reference ID', 'Payment ID', 'Ref No.', 'Reference No.']),
                'accepted_status_texts' => json_encode(['paid', 'successful', 'success', 'completed', 'sent']),
                'confusion_map' => null,
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        // Placeholder clinic accounts — the manager fills in the real GCash /
        // Maya registered name and last-4 via Receipt Scanner Settings before
        // the recipient validation rule can pass.
        foreach (['gcash', 'maya'] as $provider) {
            DB::table('clinic_payment_accounts')->updateOrInsert(
                ['provider' => $provider, 'account_name' => 'Pawesome Retreat Inc.'],
                [
                    'account_last4' => null,
                    'active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        }
    }
}
