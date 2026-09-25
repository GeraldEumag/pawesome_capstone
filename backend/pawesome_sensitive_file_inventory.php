<?php

/**
 * READ-ONLY inventory of sensitive file references and their storage location.
 * Queries the local dev database and checks disk existence — no writes.
 */

require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

$refs = [
    'service_requests.payment_proof' => DB::table('service_requests')->whereNotNull('payment_proof')->pluck('payment_proof', 'id'),
    'customer_orders.payment_proof' => DB::table('customer_orders')->whereNotNull('payment_proof')->pluck('payment_proof', 'id'),
    'boardings.payment_proof' => DB::table('boardings')->whereNotNull('payment_proof')->pluck('payment_proof', 'id'),
    'medical_confinements.payment_proof' => DB::table('medical_confinements')->whereNotNull('payment_proof')->pluck('payment_proof', 'id'),
    'boardings.vaccination_card' => DB::table('boardings')->whereNotNull('vaccination_card')->pluck('vaccination_card', 'id'),
    'pets.image' => DB::table('pets')->whereNotNull('image')->pluck('image', 'id'),
    'boarding_care_logs.photo_path' => DB::table('boarding_care_logs')->whereNotNull('photo_path')->pluck('photo_path', 'id'),
    'users.profile_photo' => DB::table('users')->whereNotNull('profile_photo')->pluck('profile_photo', 'id'),
    'inventory_items.photo' => DB::table('inventory_items')->whereNotNull('photo')->pluck('photo', 'id'),
    'inventory_batches.proof_photo' => DB::table('inventory_batches')->whereNotNull('proof_photo')->pluck('proof_photo', 'id'),
];

$counts = ['private' => 0, 'public' => 0, 'missing' => 0, 'external/other' => 0];

foreach ($refs as $label => $rows) {
    echo "== {$label} (" . $rows->count() . ") ==\n";
    foreach ($rows as $id => $path) {
        if (str_starts_with($path, 'http') || str_starts_with($path, 'data:') || str_starts_with($path, '/api/')) {
            $loc = 'external/other';
        } elseif (Storage::disk('private')->exists($path)) {
            $loc = 'private';
        } elseif (Storage::disk('public')->exists($path)) {
            $loc = 'public';
        } else {
            $loc = 'missing';
        }
        $counts[$loc]++;
        echo "  #{$id} [{$loc}] {$path}\n";
    }
}

echo "\n== DISK TOTALS (referenced files) ==\n";
foreach ($counts as $k => $v) echo "  {$k}: {$v}\n";

// Unreferenced files on disk (orphans)
echo "\n== UNREFERENCED FILES ON DISK ==\n";
$referenced = collect($refs)->flatMap(fn ($r) => $r->values())->all();
foreach (['private', 'public'] as $disk) {
    foreach (Storage::disk($disk)->allFiles() as $f) {
        if (!in_array($f, $referenced, true)) {
            echo "  [{$disk}] {$f}\n";
        }
    }
}
