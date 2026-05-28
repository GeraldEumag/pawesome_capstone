<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BitposItemsSeeder extends Seeder
{
    /**
     * Map BITPOS CSV categories to system-valid categories:
     * Valid: Food, Accessories, Grooming, Toys, Health, Services
     */
    private function mapCategory(string $raw): string
    {
        $cat = strtoupper(trim($raw));

        $map = [
            // Health / Meds
            'CLINIC/LAB/MEDS'       => 'Health',
            'INJECTABLE MEDICATION' => 'Health',
            'SURGERY'               => 'Health',
            'PRESCRIPTION DIET'     => 'Health',
            'FOOD SUPPLEMENT'       => 'Health',
            'SHAMPOO'               => 'Health',
            'SEVICES'               => 'Services',

            // Accessories
            'SUPPLY AND ACCESSORIES' => 'Accessories',

            // Grooming
            'GROOMING' => 'Grooming',

            // Services
            'BOARDING'  => 'Services',
            'DAYCARE'   => 'Services',
            'SERVICING' => 'Services',

            // Food
            'DRY DOG FOOD'   => 'Food',
            'WET DOG FOOD'   => 'Food',
            'DOG WET FOOD'   => 'Food',
            'DRY CAT FOOD'   => 'Food',
            'WET CAT FOOD'   => 'Food',
            'DOG TREAT'      => 'Food',
            'DOG TREATS'     => 'Food',
            'CAT TREAT'      => 'Food',
            'CAT TREATS'     => 'Food',
        ];

        return $map[$cat] ?? 'Accessories';
    }

    private function cleanPrice(?string $value): ?float
    {
        if ($value === null || trim($value) === '' || strtoupper(trim($value)) === 'INVENTORY') {
            return null;
        }
        // Remove commas and quotes
        $cleaned = str_replace(['"', ','], '', trim($value));
        return is_numeric($cleaned) ? (float) $cleaned : null;
    }

    private function cleanQty(?string $value): int
    {
        if ($value === null || trim($value) === '' || strtoupper(trim($value)) === 'INVENTORY') {
            return 0;
        }
        $cleaned = str_replace(['"', ','], '', trim($value));
        return is_numeric($cleaned) ? (int) $cleaned : 0;
    }

    private function cleanDate(?string $value): ?string
    {
        if ($value === null || trim($value) === '' || strtoupper(trim($value)) === 'INVENTORY') {
            return null;
        }
        $value = trim($value);
        try {
            $ts = strtotime($value);
            if ($ts === false) return null;
            $date = date('Y-m-d', $ts);
            // Reject obviously invalid years
            $year = (int) date('Y', $ts);
            if ($year < 2020 || $year > 2035) return null;
            return $date;
        } catch (\Exception $e) {
            return null;
        }
    }

    private function generateSku(string $category, int $index): string
    {
        $prefixes = [
            'Food'        => 'FOO',
            'Accessories' => 'ACC',
            'Grooming'    => 'GRM',
            'Toys'        => 'TOY',
            'Health'      => 'HLT',
            'Services'    => 'SRV',
        ];
        $prefix = $prefixes[$category] ?? 'ITM';
        return $prefix . '-' . str_pad($index, 5, '0', STR_PAD_LEFT);
    }

    public function run(): void
    {
        $csvPath = base_path('../frontend/src/assets/ITEMS FILES (BITPOS).csv');

        if (!file_exists($csvPath)) {
            $this->command->error("CSV file not found at: {$csvPath}");
            return;
        }

        $handle = fopen($csvPath, 'r');
        if (!$handle) {
            $this->command->error("Cannot open CSV file.");
            return;
        }

        // Skip header row
        fgetcsv($handle);

        $inserted = 0;
        $skipped  = 0;
        $skuIndex = 1;
        $now      = now();

        $this->command->info("Starting BITPOS items import...");

        DB::beginTransaction();
        try {
            while (($row = fgetcsv($handle)) !== false) {
                // Skip empty rows
                if (empty(array_filter($row))) {
                    continue;
                }

                // Columns: barcode, name, category, uom, qty, total_cost, unit_price, retail, wholesale, expiry, supplier
                [$barcode, $name, $csvCategory, $uom, $qty, $totalCost, $unitPrice, $retail, $wholesale, $expiry, $supplier] = array_pad($row, 11, null);

                $name = trim($name ?? '');
                if ($name === '') {
                    $skipped++;
                    continue;
                }

                $category   = $this->mapCategory($csvCategory ?? '');
                $stock      = $this->cleanQty($qty);
                $cost       = $this->cleanPrice($unitPrice);
                $price      = $this->cleanPrice($retail);
                $expiryDate = $this->cleanDate($expiry);
                $skuBarcode = trim($barcode ?? '');

                // Use barcode as SKU if it looks reasonable (numeric or alphanumeric, max 20 chars)
                if ($skuBarcode !== '' && strlen($skuBarcode) <= 20 && preg_match('/^[A-Za-z0-9\-]+$/', $skuBarcode)) {
                    $sku = $skuBarcode;
                } else {
                    $sku = $this->generateSku($category, $skuIndex);
                }

                // Check for duplicate SKU — append suffix if needed
                $finalSku = $sku;
                $suffix   = 1;
                while (DB::table('inventory_items')->where('sku', $finalSku)->exists()) {
                    $finalSku = $sku . '-' . $suffix++;
                }

                // Handle barcode — null it out if it would violate unique constraint
                $barcodeClean = strlen(trim($barcode ?? '')) <= 20 ? trim($barcode) : null;
                if ($barcodeClean !== null && $barcodeClean !== '') {
                    if (DB::table('inventory_items')->where('barcode', $barcodeClean)->exists()) {
                        $barcodeClean = null;
                    }
                } else {
                    $barcodeClean = null;
                }

                DB::table('inventory_items')->insert([
                    'sku'          => $finalSku,
                    'name'         => $name,
                    'category'     => $category,
                    'brand'        => null,
                    'supplier'     => trim($supplier ?? '') ?: null,
                    'description'  => null,
                    'stock'        => $stock,
                    'reorder_level'=> 10,
                    'price'        => $price ?? 0,
                    'cost'         => $cost,
                    'expiry_date'  => $expiryDate,
                    'status'       => 'active',
                    'is_sellable'  => 1,
                    'barcode'      => $barcodeClean,
                    'created_at'   => $now,
                    'updated_at'   => $now,
                ]);

                $inserted++;
                $skuIndex++;
            }

            fclose($handle);
            DB::commit();

            $this->command->info("✅ Import complete: {$inserted} items inserted, {$skipped} skipped.");
        } catch (\Exception $e) {
            DB::rollBack();
            fclose($handle);
            $this->command->error("❌ Import failed: " . $e->getMessage());
            throw $e;
        }
    }
}
