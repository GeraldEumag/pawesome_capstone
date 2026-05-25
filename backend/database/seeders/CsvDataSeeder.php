<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use App\Models\InventoryItem;
use App\Models\Service;
use App\Models\Supplier;
use App\Models\InventoryLog;
use Carbon\Carbon;

class CsvDataSeeder extends Seeder
{
    public function run(): void
    {
        $csvPath = base_path('../frontend/src/assets/ITEMS FILES (BITPOS).csv');
        if (!file_exists($csvPath)) {
            $this->command->warn("CSV file not found: {$csvPath}");
            return;
        }

        $handle = fopen($csvPath, 'r');
        if (!$handle) {
            $this->command->warn("Could not open CSV file.");
            return;
        }

        $header = fgetcsv($handle);
        if (!$header) {
            $this->command->warn("CSV file is empty.");
            return;
        }

        $productCount = 0;
        $serviceCount = 0;
        $supplierMap = []; // name => id

        while (($row = fgetcsv($handle)) !== false) {
            if (count($row) < 11) {
                continue;
            }

            // Use numeric indices: [0]=SKU, [1]=ITEM NAME, [2]=CATEGORY, [3]=UOM, [4]=QTY, [5]=TOTAL COST, [6]=UNIT PRICE, [7]=RETAIL, [8]=WHOLESALE, [9]=EXPIRY DATE, [10]=SUPPLIER
            $sku = trim($row[0] ?? '');
            $name = trim($row[1] ?? '');
            $category = trim($row[2] ?? '');
            $uom = trim(strtolower($row[3] ?? ''));
            $qty = $this->parseNumber($row[4] ?? null);
            $totalCost = $this->parseNumber($row[5] ?? null);
            $unitPrice = $this->parseNumber($row[6] ?? null);
            $retail = $this->parseNumber($row[7] ?? null);
            $wholesale = $this->parseNumber($row[8] ?? null);
            $expiryDate = $this->parseDate($row[9] ?? null);
            $supplierName = trim($row[10] ?? '');

            if (empty($name)) continue;

            // Determine cost: prefer total_cost/qty, fallback to unit_price
            $cost = null;
            if ($qty > 0 && $totalCost > 0) {
                $cost = round($totalCost / $qty, 2);
            } elseif ($unitPrice > 0) {
                $cost = $unitPrice;
            }

            // Determine selling price: prefer retail, then unit_price
            $price = $retail > 0 ? $retail : ($unitPrice > 0 ? $unitPrice : 0);
            $stock = $qty ?? 0;

            // Handle supplier
            $supplierId = null;
            if (!empty($supplierName) && $supplierName !== '-') {
                if (!isset($supplierMap[$supplierName])) {
                    $supplier = Supplier::firstOrCreate(
                        ['name' => $supplierName],
                        [
                            'contact_person' => '',
                            'phone' => '',
                            'email' => '',
                            'address' => '',
                            'notes' => 'Auto-imported from CSV',
                            'is_active' => true,
                        ]
                    );
                    $supplierMap[$supplierName] = $supplier->id;
                }
                $supplierId = $supplierMap[$supplierName];
            }

            if ($uom === 'servicing') {
                // Create as Service
                $serviceCategory = $this->mapServiceCategory($category);
                Service::updateOrCreate(
                    ['name' => $name],
                    [
                        'category' => $serviceCategory,
                        'price' => $price,
                        'description' => "Service imported from CSV. Category: {$category}",
                        'is_active' => true,
                        'duration_minutes' => 30,
                    ]
                );
                $serviceCount++;
            } else {
                // Create as InventoryItem (product)
                $appCategory = $this->mapProductCategory($category);
                // Use SKU as unique key when present, otherwise name
                $uniqueKey = !empty($sku) ? ['sku' => $sku] : ['name' => $name];
                $itemSku = !empty($sku) ? $sku : ('CSV-' . strtoupper(uniqid()));

                // Skip if SKU already exists and we're not matching on SKU
                if (empty($sku)) {
                    $existing = InventoryItem::where('sku', $itemSku)->first();
                    if ($existing) {
                        $itemSku = 'CSV-' . strtoupper(uniqid());
                    }
                }

                $item = InventoryItem::updateOrCreate(
                    $uniqueKey,
                    [
                        'sku' => $itemSku,
                        'name' => $name,
                        'category' => $appCategory,
                        'brand' => '',
                        'supplier' => $supplierName ?: '',
                        'supplier_id' => $supplierId,
                        'stock' => $stock,
                        'price' => $price,
                        'cost' => $cost,
                        'expiry_date' => $expiryDate,
                        'status' => 'active',
                        'is_sellable' => true,
                        'description' => "Imported from CSV. Original category: {$category}",
                        'reorder_level' => 10,
                    ]
                );
                $productCount++;
            }
        }

        fclose($handle);

        $this->command->info("CSV Data Seeded: {$productCount} products, {$serviceCount} services.");
    }

    private function parseNumber($value): ?float
    {
        if (empty($value)) return null;
        // Remove commas and currency symbols
        $clean = preg_replace('/[^0-9.\-]/', '', str_replace(',', '', trim($value)));
        if ($clean === '' || $clean === '-') return null;
        return is_numeric($clean) ? (float) $clean : null;
    }

    private function parseDate($value): ?string
    {
        if (empty($value) || strtolower($value) === 'n/a') return null;
        $formats = ['d M Y', 'm/d/Y', 'Y-m-d', 'd/m/Y'];
        foreach ($formats as $fmt) {
            try {
                $date = Carbon::createFromFormat($fmt, trim($value));
                if ($date && $date->year >= 2000 && $date->year <= 2050) {
                    return $date->toDateString();
                }
            } catch (\Exception $e) {
                // Try next format
            }
        }
        // Try general parse
        try {
            $date = Carbon::parse(trim($value));
            if ($date->year >= 2000 && $date->year <= 2050) {
                return $date->toDateString();
            }
        } catch (\Exception $e) {
            return null;
        }
        return null;
    }

    private function mapProductCategory(string $csvCategory): string
    {
        $csvLower = strtolower($csvCategory);
        if (str_contains($csvLower, 'food')) return 'Food';
        if (str_contains($csvLower, 'groom')) return 'Grooming';
        if (str_contains($csvLower, 'toy')) return 'Toys';
        if (str_contains($csvLower, 'health') || str_contains($csvLower, 'med') || str_contains($csvLower, 'vaccine')) return 'Health';
        if (str_contains($csvLower, 'accessories') || str_contains($csvLower, 'supply')) return 'Accessories';
        return 'Accessories';
    }

    private function mapServiceCategory(string $csvCategory): string
    {
        $csvLower = strtolower($csvCategory);
        if (str_contains($csvLower, 'surgery')) return 'Surgery';
        if (str_contains($csvLower, 'groom')) return 'Grooming';
        if (str_contains($csvLower, 'dental')) return 'Dental';
        if (str_contains($csvLower, 'vaccine')) return 'Vaccination';
        if (str_contains($csvLower, 'consult')) return 'Consultation';
        if (str_contains($csvLower, 'lab') || str_contains($csvLower, 'diagnostic')) return 'Diagnostics';
        if (str_contains($csvLower, 'boarding') || str_contains($csvLower, 'hotel')) return 'Hotel';
        return 'Treatment';
    }
}
