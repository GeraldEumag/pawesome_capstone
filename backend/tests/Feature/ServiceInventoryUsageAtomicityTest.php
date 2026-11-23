<?php

namespace Tests\Feature;

use App\Models\Boarding;
use App\Models\Customer;
use App\Models\Grooming;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Services\BoardingInventoryService;
use App\Services\GroomingInventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ServiceInventoryUsageAtomicityTest extends TestCase
{
    use RefreshDatabase;

    public function test_grooming_rejection_rolls_back_other_valid_usage_lines(): void
    {
        [$customer, $pet] = $this->customerAndPet();
        $grooming = Grooming::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'service' => 'Atomicity grooming',
            'appointment_date' => now()->toDateString(),
        ]);
        $valid = $this->inventoryItem(true);
        $invalid = $this->inventoryItem(false);
        $service = new GroomingInventoryService();

        $rejected = $service->recordInventoryUsage([
            ['inventory_item_id' => $valid->id, 'quantity_used' => 1],
            ['inventory_item_id' => $invalid->id, 'quantity_used' => 1],
        ], $grooming->id, $pet->id);

        $this->assertFalse($rejected['success']);
        $this->assertSame([], $rejected['usages']);
        $this->assertSame(0, $rejected['processed_items']);
        $this->assertSame(5, (int) $valid->fresh()->stock);
        $this->assertDatabaseMissing('service_item_usages', [
            'service_type' => 'grooming',
            'service_id' => $grooming->id,
        ]);
        $this->assertDatabaseMissing('inventory_logs', [
            'inventory_item_id' => $valid->id,
            'movement_type' => 'grooming_usage',
        ]);

        $accepted = $service->recordInventoryUsage([
            ['inventory_item_id' => $valid->id, 'quantity_used' => 1],
        ], $grooming->id, $pet->id);

        $this->assertTrue($accepted['success']);
        $this->assertSame(4, (int) $valid->fresh()->stock);
        $this->assertDatabaseHas('service_item_usages', [
            'service_type' => 'grooming',
            'service_id' => $grooming->id,
            'inventory_item_id' => $valid->id,
            'quantity_used' => 1,
        ]);
    }

    public function test_boarding_rejection_rolls_back_other_valid_usage_lines(): void
    {
        [$customer, $pet] = $this->customerAndPet();
        $boarding = Boarding::create([
            'customer_id' => $customer->id,
            'pet_id' => $pet->id,
            'pet_name' => $pet->name,
            'check_in' => now()->toDateString(),
        ]);
        $valid = $this->inventoryItem(true);
        $invalid = $this->inventoryItem(false);
        $service = new BoardingInventoryService();

        $rejected = $service->recordInventoryUsage([
            ['inventory_item_id' => $valid->id, 'quantity_used' => 1, 'usage_type' => 'food'],
            ['inventory_item_id' => $invalid->id, 'quantity_used' => 1, 'usage_type' => 'food'],
        ], $boarding->id, $pet->id);

        $this->assertFalse($rejected['success']);
        $this->assertSame([], $rejected['usages']);
        $this->assertSame(0, $rejected['processed_items']);
        $this->assertSame(5, (int) $valid->fresh()->stock);
        $this->assertDatabaseMissing('service_item_usages', [
            'service_type' => 'boarding',
            'service_id' => $boarding->id,
        ]);
        $this->assertDatabaseMissing('inventory_logs', [
            'inventory_item_id' => $valid->id,
            'movement_type' => 'boarding_food_usage',
        ]);

        $accepted = $service->recordInventoryUsage([
            ['inventory_item_id' => $valid->id, 'quantity_used' => 1, 'usage_type' => 'food'],
        ], $boarding->id, $pet->id);

        $this->assertTrue($accepted['success']);
        $this->assertSame(4, (int) $valid->fresh()->stock);
        $this->assertDatabaseHas('service_item_usages', [
            'service_type' => 'boarding',
            'service_id' => $boarding->id,
            'inventory_item_id' => $valid->id,
            'quantity_used' => 1,
        ]);
    }

    private function customerAndPet(): array
    {
        $customer = Customer::create([
            'name' => 'Atomicity test customer',
            'email' => 'atomicity-' . uniqid() . '@example.test',
            'phone' => '0000000000',
            'is_active' => true,
        ]);
        $pet = Pet::create([
            'customer_id' => $customer->id,
            'name' => 'Atomicity test pet',
            'species' => 'Dog',
            'status' => 'active',
        ]);

        return [$customer, $pet];
    }

    private function inventoryItem(bool $serviceConsumable): InventoryItem
    {
        return InventoryItem::create([
            'sku' => 'SVC-' . strtoupper(uniqid()),
            'name' => 'Service usage test item',
            'category' => 'Grooming',
            'price' => 10,
            'cost' => 5,
            'stock' => 5,
            'reorder_level' => 1,
            'status' => 'active',
            'is_sellable' => false,
            'is_service_consumable' => $serviceConsumable,
            'issue_method' => 'FIFO',
        ]);
    }
}
