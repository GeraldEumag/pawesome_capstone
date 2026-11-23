<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\InventoryReturn;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class InventoryConcurrentReturnTest extends TestCase
{
    use RefreshDatabase;

    public function beginDatabaseTransaction(): void
    {
        // Separate Laravel request workers must see committed fixture rows.
    }

    public function test_concurrent_returns_cannot_exceed_the_sold_quantity(): void
    {
        if (!function_exists('proc_open')) {
            $this->markTestSkipped('proc_open is required for the separate-request concurrency test.');
        }

        $users = collect([1, 2])->map(fn () => User::factory()->create([
            'role' => 'inventory',
            'is_active' => true,
        ]));
        $item = InventoryItem::create([
            'sku' => 'RET-RACE-' . strtoupper(uniqid()),
            'name' => 'Return Concurrency Item',
            'category' => 'Accessories',
            'price' => 10,
            'stock' => 0,
            'reorder_level' => 0,
            'status' => 'active',
            'is_sellable' => false,
            'issue_method' => 'FIFO',
        ]);

        $saleId = DB::table('sales')->insertGetId([
            'amount' => 10,
            'type' => 'product',
            'transaction_number' => 'RET-RACE-' . strtoupper(uniqid()),
            'payment_method' => 'cash',
            'status' => 'completed',
            'subtotal' => 10,
            'total_amount' => 10,
            'cashier_id' => $users[0]->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('sale_items')->insert([
            'sale_id' => $saleId,
            'item_type' => 'product',
            'item_name' => $item->name,
            'product_id' => $item->id,
            'quantity' => 1,
            'unit_price' => 10,
            'total_price' => 10,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $payload = base64_encode(json_encode([
            'inventory_item_id' => $item->id,
            'quantity' => 1,
            'source_type' => 'sale',
            'source_id' => $saleId,
            'return_reason' => 'Concurrent return test',
        ], JSON_THROW_ON_ERROR));
        $tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pawesome-return-race-' . bin2hex(random_bytes(6));
        if (!mkdir($tempDir) && !is_dir($tempDir)) {
            $this->fail('Could not create the temporary return concurrency-test directory.');
        }

        $gate = $tempDir . DIRECTORY_SEPARATOR . 'go';
        $worker = __DIR__ . DIRECTORY_SEPARATOR . 'Fixtures' . DIRECTORY_SEPARATOR . 'inventory-return-concurrent-worker.php';
        $processes = [];
        $pipesByProcess = [];
        $readyFiles = [];
        $results = [];

        try {
            foreach ($users as $index => $user) {
                $ready = $tempDir . DIRECTORY_SEPARATOR . "ready-{$index}";
                $command = [
                    PHP_BINARY,
                    $worker,
                    $ready,
                    $gate,
                    $user->createToken('inventory-return-race')->plainTextToken,
                    "return-race-{$index}",
                    $payload,
                ];
                $pipes = [];
                $process = proc_open($command, [
                    0 => ['pipe', 'r'],
                    1 => ['pipe', 'w'],
                    2 => ['pipe', 'w'],
                ], $pipes, dirname(__DIR__, 2));

                if (!is_resource($process)) {
                    $this->fail('Could not start both inventory return workers.');
                }

                fclose($pipes[0]);
                $processes[] = $process;
                $pipesByProcess[] = $pipes;
                $readyFiles[] = $ready;
            }

            $deadline = microtime(true) + 15;
            do {
                $bothReady = count(array_filter($readyFiles, 'is_file')) === 2;
                if ($bothReady) {
                    break;
                }
                usleep(10000);
            } while (microtime(true) < $deadline);

            file_put_contents($gate, 'go');
            $this->assertTrue($bothReady, 'Both return workers should reach the concurrency barrier.');

            foreach ($processes as $index => $process) {
                $stdout = stream_get_contents($pipesByProcess[$index][1]);
                $stderr = stream_get_contents($pipesByProcess[$index][2]);
                fclose($pipesByProcess[$index][1]);
                fclose($pipesByProcess[$index][2]);
                $exitCode = proc_close($process);
                $decoded = json_decode(trim($stdout), true);

                $this->assertSame(0, $exitCode, "Worker {$index} failed: {$stderr}");
                $this->assertIsArray($decoded, "Worker {$index} returned invalid output: {$stdout} {$stderr}");
                $results[] = $decoded;
            }
        } finally {
            if (!is_file($gate)) {
                file_put_contents($gate, 'stop');
            }
            foreach ($processes as $index => $process) {
                if (is_resource($process)) {
                    proc_terminate($process);
                    foreach ($pipesByProcess[$index] ?? [] as $pipe) {
                        if (is_resource($pipe)) {
                            fclose($pipe);
                        }
                    }
                    proc_close($process);
                }
            }
            foreach (glob($tempDir . DIRECTORY_SEPARATOR . '*') ?: [] as $path) {
                if (is_file($path)) {
                    unlink($path);
                }
            }
            rmdir($tempDir);
        }

        $this->assertSame([201, 422], collect($results)->pluck('status')->sort()->values()->all());
        $this->assertSame(1, (int) InventoryReturn::where('source_type', 'sale')
            ->where('source_id', $saleId)
            ->where('inventory_item_id', $item->id)
            ->sum('quantity'));
        $this->assertSame(1, InventoryReturn::where('source_id', $saleId)->count());
        $this->assertSame(0, (int) $item->fresh()->stock, 'return recording does not auto-restock');
    }
}
