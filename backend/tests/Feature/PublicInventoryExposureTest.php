<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * F-03: public inventory endpoints must never expose internal purchasing
 * fields (cost, supplier, supplier_id, reorder_level, internal flags).
 */
class PublicInventoryExposureTest extends TestCase
{
    use RefreshDatabase;

    private const INTERNAL_KEYS = [
        'cost',
        'supplier',
        'supplier_id',
        'reorder_level',
        'threshold',
        'created_at',
        'updated_at',
        'deleted_at',
        'archive_reason',
        'archived_at',
        'archived_by',
        'customer_snapshot',
        'pet_snapshot',
        'service_item_usage_snapshot',
        'payment_snapshot',
    ];

    private const PUBLIC_KEYS = [
        'id', 'name', 'sku', 'category', 'description', 'brand',
        'price', 'stock', 'status', 'is_sellable', 'photo_url',
    ];

    private InventoryItem $item;

    protected function setUp(): void
    {
        parent::setUp();

        $this->item = InventoryItem::create([
            'sku'           => 'PUB-EXPOSE-001',
            'name'          => 'Exposure Test Item',
            'category'      => 'Food',
            'brand'         => 'PubBrand',
            'description'   => 'Visible to customers',
            'supplier'      => 'Secret Supplier Co',
            'supplier_id'   => null,
            'price'         => 499.50,
            'cost'          => 123.45,
            'stock'         => 12,
            'reorder_level' => 3,
            'status'        => 'active',
            'is_sellable'   => true,
        ]);
    }

    public function test_public_items_list_excludes_internal_fields(): void
    {
        $response = $this->getJson('/api/inventory/public/items');

        $response->assertStatus(200);
        $items = $response->json('items');
        $this->assertNotEmpty($items);

        foreach ($items as $item) {
            foreach (self::INTERNAL_KEYS as $key) {
                $this->assertArrayNotHasKey(
                    $key,
                    $item,
                    "Public inventory list leaked internal field: {$key}"
                );
            }
        }

        $mine = collect($items)->firstWhere('sku', 'PUB-EXPOSE-001');
        $this->assertNotNull($mine);
        foreach (self::PUBLIC_KEYS as $key) {
            $this->assertArrayHasKey($key, $mine, "Missing public field: {$key}");
        }
        $this->assertEquals(499.50, $mine['price']);
        $this->assertEquals(12, $mine['stock']);
        $this->assertArrayNotHasKey('photo', $mine);
    }

    public function test_public_item_detail_excludes_internal_fields(): void
    {
        $response = $this->getJson("/api/inventory/public/item/{$this->item->id}");

        $response->assertStatus(200);
        $item = $response->json('item');
        $this->assertNotNull($item);

        foreach (self::INTERNAL_KEYS as $key) {
            $this->assertArrayNotHasKey(
                $key,
                $item,
                "Public item detail leaked internal field: {$key}"
            );
        }
        foreach (self::PUBLIC_KEYS as $key) {
            $this->assertArrayHasKey($key, $item, "Missing public field: {$key}");
        }
        $this->assertSame('PubBrand', $item['brand']);
        $this->assertTrue($response->json('in_stock'));
    }

    public function test_public_items_still_works_for_authenticated_users(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $token = $user->createToken('t')->plainTextToken;

        $response = $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->getJson('/api/inventory/public/items');

        $response->assertStatus(200);
        $mine = collect($response->json('items'))->firstWhere('sku', 'PUB-EXPOSE-001');
        $this->assertNotNull($mine);
        $this->assertArrayNotHasKey('cost', $mine);
    }

    public function test_sellable_endpoint_excludes_internal_fields(): void
    {
        $response = $this->getJson('/api/inventory/sellable');

        $response->assertStatus(200);
        foreach ($response->json('products') as $product) {
            foreach (self::INTERNAL_KEYS as $key) {
                $this->assertArrayNotHasKey(
                    $key,
                    $product,
                    "Sellable endpoint leaked internal field: {$key}"
                );
            }
        }
    }
}
