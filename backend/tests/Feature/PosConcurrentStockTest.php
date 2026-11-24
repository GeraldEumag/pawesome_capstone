<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PosConcurrentStockTest extends TestCase
{
    use RefreshDatabase;

    public function beginDatabaseTransaction(): void
    {
        // Separate request workers must see committed fixture data; this
        // dedicated test runs only against the disposable Phase 2 database.
    }

    private array $committedUserIds = [];
    private array $committedItemIds = [];
    private ?\Illuminate\Support\Carbon $windowStart = null;

    protected function tearDown(): void
    {
        // Workers run in separate processes outside the test transaction, so
        // every row they (and this test) write is committed. Remove it again
        // or later tests in the shared disposable database see phantom rows.
        $saleIds = \App\Models\Sale::whereIn('cashier_id', $this->committedUserIds)->pluck('id');
        \App\Models\SaleItem::whereIn('sale_id', $saleIds)
            ->orWhereIn('product_id', $this->committedItemIds)
            ->delete();
        \App\Models\Payment::whereIn('sale_id', $saleIds)->delete();
        \App\Models\Invoice::whereIn('sale_id', $saleIds)->delete();
        \App\Models\Sale::whereIn('id', $saleIds)->delete();
        \App\Models\InventoryReturn::whereIn('inventory_item_id', $this->committedItemIds)->delete();
        \App\Models\InventoryLog::whereIn('inventory_item_id', $this->committedItemIds)
            ->orWhereIn('user_id', $this->committedUserIds)
            ->delete();
        if ($this->windowStart) {
            \App\Models\Notification::whereIn('user_id', $this->committedUserIds)
                ->where('created_at', '>=', $this->windowStart)
                ->delete();
            \Illuminate\Support\Facades\DB::table('email_deliveries')
                ->where('created_at', '>=', $this->windowStart)
                ->delete();
        }
        \Illuminate\Support\Facades\DB::table('personal_access_tokens')
            ->whereIn('tokenable_id', $this->committedUserIds)
            ->delete();
        \App\Models\InventoryItem::whereIn('id', $this->committedItemIds)->delete();
        // Per-model delete: fires the `deleting` hook that tombstones
        // employee_no/email/username off the unique indexes. A mass
        // ->delete() would soft-delete without tombstoning and leave
        // PAW-XXXX identifiers claimed for later tests.
        \App\Models\User::whereIn('id', $this->committedUserIds)->get()
            ->each(fn (\App\Models\User $u) => $u->delete());

        parent::tearDown();
    }

    public function test_two_concurrent_pos_requests_cannot_sell_the_last_unit_twice(): void
    {
        $this->windowStart = now();
        if (!function_exists('proc_open')) {
            $this->markTestSkipped('proc_open is required for the separate-request concurrency test.');
        }

        $cashier = User::factory()->create(['role' => 'cashier', 'is_active' => true]);
        $this->committedUserIds[] = $cashier->id;
        $token = $cashier->createToken('pos-concurrency')->plainTextToken;
        $product = InventoryItem::create([
            'sku' => 'P2-RACE-' . strtoupper(uniqid()),
            'name' => 'Last Unit Product',
            'category' => 'Food',
            'price' => 100,
            'stock' => 1,
            'reorder_level' => 1,
            'status' => 'active',
            'is_sellable' => true,
        ]);
        $this->committedItemIds[] = $product->id;

        $payload = base64_encode(json_encode([
            'items' => [[
                'item_type' => 'product',
                'item_id' => $product->id,
                'quantity' => 1,
                'unit_price' => 100,
            ]],
            'payment_method' => 'cash',
            'cash_received' => 100,
        ], JSON_THROW_ON_ERROR));

        $tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pawesome-pos-race-' . bin2hex(random_bytes(6));
        if (!mkdir($tempDir) && !is_dir($tempDir)) {
            $this->fail('Could not create the temporary concurrency-test directory.');
        }

        $gate = $tempDir . DIRECTORY_SEPARATOR . 'go';
        $worker = __DIR__ . DIRECTORY_SEPARATOR . 'Fixtures' . DIRECTORY_SEPARATOR . 'pos-concurrent-worker.php';
        $processes = [];
        $pipesByProcess = [];
        $results = [];

        try {
            for ($index = 0; $index < 2; $index++) {
                $ready = $tempDir . DIRECTORY_SEPARATOR . "ready-{$index}";
                $command = [
                    PHP_BINARY,
                    $worker,
                    $ready,
                    $gate,
                    $token,
                    "phase2-concurrent-{$index}",
                    $payload,
                ];
                $pipes = [];
                $process = proc_open($command, [
                    0 => ['pipe', 'r'],
                    1 => ['pipe', 'w'],
                    2 => ['pipe', 'w'],
                ], $pipes, dirname(__DIR__, 2));

                if (!is_resource($process)) {
                    $this->fail('Could not start both POS request workers.');
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

            // Release both independently booted Laravel requests together.
            file_put_contents($gate, 'go');
            $this->assertTrue($bothReady, 'Both workers should reach the concurrency barrier.');

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

        $this->assertSame([200, 422], collect($results)->pluck('status')->sort()->values()->all());
        $this->assertSame(0, (int) $product->fresh()->stock);
        $this->assertSame(1, Sale::count());
        $this->assertSame(1, SaleItem::count());
        $this->assertSame(1, Payment::count());
    }
}
