<?php

namespace App\Http\Controllers\Cashier;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Payment;
use App\Models\Invoice;
use App\Models\InventoryItem;
use App\Models\Customer;
use App\Models\Service;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class POSController extends Controller
{
    /**
     * Process a new sale transaction
     */
    public function processTransaction(Request $request)
    {
        $payload = $request->all();
        $payload['items'] = collect($payload['items'] ?? [])->map(function ($item) {
            if (($item['item_type'] ?? null) === 'product') {
                $item['item_id'] = $item['item_id'] ?? ($item['id'] ?? null);
                if (empty($item['item_name']) && !empty($item['item_id'])) {
                    $item['item_name'] = InventoryItem::find($item['item_id'])?->name;
                }
            }

            return $item;
        })->all();
        $request->merge($payload);

        $validator = Validator::make($payload, [
            'customer_id' => 'nullable|integer',
            'customer_name' => 'nullable|string|max:255',
            'items' => 'required|array|min:1',
            'items.*.item_type' => 'required|in:product,service',
            'items.*.item_id' => 'required_if:items.*.item_type,product|exists:inventory_items,id',
            'items.*.service_id' => 'required_if:items.*.item_type,service|exists:services,id',
            'items.*.item_name' => 'required|string',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.unit_price' => 'required|numeric|min:0',
            'items.*.discount_amount' => 'nullable|numeric|min:0',
            'payment_method' => 'required|in:cash,credit_card,debit_card,gcash,maya,bank_transfer,check',
            'card_type' => 'nullable|required_if:payment_method,credit_card|in:visa,mastercard,amex',
            'card_last_four' => 'nullable|string|size:4',
            'reference_number' => 'nullable|string',
            'cash_received' => 'required_if:payment_method,cash|numeric|min:0',
            'discount_code' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            DB::beginTransaction();

            // Calculate totals
            $subtotal = 0;
            $taxRate = 0.12; // 12% VAT
            $discountAmount = 0;
            $saleCustomerId = null;

            if (!empty($payload['customer_id'])) {
                $saleCustomerId = Customer::find($payload['customer_id'])?->id;
                if (!$saleCustomerId) {
                    $customerUser = \App\Models\User::find($payload['customer_id']);
                    $saleCustomerId = $customerUser
                        ? Customer::where('email', $customerUser->email)->value('id')
                        : null;
                }
            }

            foreach ($payload['items'] as $item) {
                $itemTotal = $item['unit_price'] * $item['quantity'];
                $itemDiscount = $item['discount_amount'] ?? 0;
                $subtotal += ($itemTotal - $itemDiscount);
            }

            foreach ($payload['items'] as $item) {
                if (($item['item_type'] ?? null) !== 'product' || empty($item['item_id'])) {
                    continue;
                }

                $inventoryItem = InventoryItem::whereKey($item['item_id'])
                    ->where('status', 'active')
                    ->whereNull('archived_at')
                    ->where('is_sellable', true)
                    ->lockForUpdate()
                    ->first();

                if (!$inventoryItem) {
                    throw new \Exception('Product is not available for POS sale.');
                }

                if ((int) $inventoryItem->stock < (int) $item['quantity']) {
                    throw new \Exception("Insufficient stock for {$inventoryItem->name}. Available: {$inventoryItem->stock}, Requested: {$item['quantity']}");
                }
            }

            $taxAmount = $subtotal * $taxRate;
            $totalAmount = $subtotal + $taxAmount - $discountAmount;

            // Create the sale. Some upgraded databases keep payment details only
            // in the payments table, while newer schemas also mirror it on sales.
            $saleData = [
                'customer_id' => $saleCustomerId,
                'cashier_id' => $request->user()?->id ?? auth()->id(),
                'type' => 'product',
                'status' => 'pending',
                'payment_type' => $payload['payment_method'],
                'subtotal' => $subtotal,
                'tax_amount' => $taxAmount,
                'discount_amount' => $discountAmount,
                'discount_code' => $payload['discount_code'] ?? null,
                'total_amount' => $totalAmount,
                'amount' => $totalAmount,
                'notes' => $payload['notes'] ?? null,
            ];

            if (Schema::hasColumn('sales', 'payment_method')) {
                $saleData['payment_method'] = $payload['payment_method'];
            }

            $sale = Sale::create($saleData);

            // Create sale items
            foreach ($payload['items'] as $item) {
                $itemTotal = $item['unit_price'] * $item['quantity'];
                $itemDiscount = $item['discount_amount'] ?? 0;
                $finalTotal = $itemTotal - $itemDiscount;

                SaleItem::create([
                    'sale_id' => $sale->id,
                    'product_id' => $item['item_type'] === 'product' ? ($item['item_id'] ?? null) : null,
                    'service_id' => $item['item_type'] === 'service' ? ($item['service_id'] ?? null) : null,
                    'item_name' => $item['item_name'],
                    'item_type' => $item['item_type'],
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'discount_amount' => $itemDiscount,
                    'total_price' => $finalTotal,
                ]);

                // Update inventory for products using centralized InventoryService
                if ($item['item_type'] === 'product' && !empty($item['item_id'])) {
                    $inventoryService = new InventoryService();
                    $inventoryService->deductStock(
                        $item['item_id'],
                        $item['quantity'],
                        'Sale',
                        'sale',
                        $sale->id
                    );
                }
            }

            // Process payment
            $cashReceived = $payload['cash_received'] ?? $totalAmount;
            $changeAmount = $payload['payment_method'] === 'cash' ? ($cashReceived - $totalAmount) : 0;

            $payment = Payment::create([
                'sale_id' => $sale->id,
                'payment_method' => $payload['payment_method'],
                'card_type' => $payload['card_type'] ?? null,
                'card_last_four' => $payload['card_last_four'] ?? null,
                'reference_number' => $payload['reference_number'] ?? null,
                'amount' => $totalAmount,
                'change_amount' => max($changeAmount, 0),
                'status' => 'completed',
                'paid_at' => now(),
            ]);

            // Mark sale as completed
            $sale->markAsCompleted();

            // Create invoice
            $invoice = Invoice::create([
                'sale_id' => $sale->id,
                'customer_id' => $saleCustomerId,
                'invoice_date' => today(),
                'status' => 'paid',
                'subtotal' => $subtotal,
                'tax_amount' => $taxAmount,
                'discount_amount' => $discountAmount,
                'total_amount' => $totalAmount,
                'paid_at' => now(),
            ]);

            DB::commit();

            return response()->json([
                'success' => true,
                'transaction' => [
                    'id' => $sale->id,
                    'transaction_number' => $sale->transaction_number,
                    'invoice_number' => $invoice->invoice_number,
                    'total_amount' => $totalAmount,
                    'tax_amount' => $taxAmount,
                    'change_amount' => $changeAmount,
                    'payment_method' => $payload['payment_method'],
                    'status' => 'completed',
                    'created_at' => $sale->created_at,
                ],
                'receipt' => $this->generateReceiptData($sale, $payment, $invoice),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Transaction failed: ' . $e->getMessage(),
            ], str_contains($e->getMessage(), 'Insufficient stock') ? 422 : 500);
        }
    }

    /**
     * Get available products for POS
     */
    public function getProducts()
    {
        $products = InventoryItem::where('stock', '>', 0)
            ->where('status', 'active')
            ->whereNull('archived_at')
            ->where('is_sellable', true)
            ->select('id', 'sku', 'name', 'category', 'price', 'stock', 'description', 'status', 'photo')
            ->orderBy('name')
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'sku' => $item->sku,
                    'name' => $item->name,
                    'price' => (float) $item->price,
                    'selling_price' => (float) $item->price,
                    'stock' => $item->stock,
                    'stock_quantity' => (int) $item->stock,
                    'available_stock' => (int) $item->stock,
                    'is_sellable' => (bool) $item->is_sellable,
                    'stock_status' => $item->stock > 0 ? 'in_stock' : 'out_of_stock',
                    'is_available' => $item->stock > 0,
                    'category' => $item->category ?: $this->getCategoryFromSku($item->sku),
                    'description' => $item->description,
                    'photo_url' => $item->photo_url,
                    'status' => $item->status,
                    'type' => 'product',
                    'inStock' => $item->stock > 0,
                ];
            });

        return response()->json([
            'success' => true,
            'data' => $products,
            'products' => $products,
            'count' => $products->count(),
            'timestamp' => now()->toIso8601String(),
        ]);
    }

    /**
     * Helper to get category from SKU
     * Maps to frontend category names for consistency
     */
    private function getCategoryFromSku($sku)
    {
        $sku = strtoupper($sku);

        // Health products (mapped to 'Health' for frontend consistency)
        if (str_contains($sku, 'VACCINE') || str_contains($sku, 'WORMER') || str_contains($sku, 'FLEA')) return 'Health';
        if (str_contains($sku, 'DCS') || str_contains($sku, 'DENTAL')) return 'Health';

        // Grooming products
        if (str_contains($sku, 'SHAMPOO') || str_contains($sku, 'GROOM')) return 'Grooming';

        // Toys
        if (str_contains($sku, 'TOY') || str_contains($sku, 'STS') || str_contains($sku, 'SQUEAKY')) return 'Toys';

        // Accessories (includes supplies like pads, leashes, collars)
        if (str_contains($sku, 'LEASH') || str_contains($sku, 'COLLAR')) return 'Accessories';
        if (str_contains($sku, 'PADS') || str_contains($sku, 'LDC') || str_contains($sku, 'BED') || str_contains($sku, 'CARRIER')) return 'Accessories';

        // Food (includes treats - all edible nutrition products)
        if (str_contains($sku, 'FOOD') || str_contains($sku, 'TREAT') || str_contains($sku, 'KIBBLE')) return 'Food';
        if (str_contains($sku, 'PDF') || str_contains($sku, 'CK') || str_contains($sku, 'PSK')) return 'Food';

        // Default to Accessories for unknown SKUs (was 'General')
        return 'Accessories';
    }

    /**
     * Get available services for POS
     */
    public function getServices()
    {
        $services = Service::select('id', 'name', 'price', 'description')
            ->orderBy('name')
            ->get()
            ->map(function ($service) {
                return [
                    'id' => $service->id,
                    'name' => $service->name,
                    'price' => (float) $service->price,
                    'category' => 'Services',
                    'description' => $service->description,
                    'type' => 'service',
                    'inStock' => true,
                ];
            });

        return response()->json(['services' => $services]);
    }

    /**
     * Get transaction details with receipt
     */
    public function getTransaction($id)
    {
        $sale = Sale::with(['items', 'payments', 'invoice', 'customer', 'cashier'])
            ->findOrFail($id);

        return response()->json([
            'transaction' => $sale,
            'receipt' => $this->generateReceiptData($sale, $sale->payments->first(), $sale->invoice),
        ]);
    }

    /**
     * Get all transactions with filtering
     */
    public function getTransactions(Request $request)
    {
        $query = Sale::with(['items', 'payments', 'customer', 'cashier'])
            ->orderBy('created_at', 'desc');

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }

        if ($request->has('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        if ($request->has('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        $transactions = $query->paginate($request->per_page ?? 20);

        return response()->json($transactions);
    }

    /**
     * Void/Refund a transaction
     */
    public function voidTransaction(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            DB::beginTransaction();

            $sale = Sale::with('items')->findOrFail($id);

            if ($sale->status === 'cancelled') {
                return response()->json([
                    'success' => false,
                    'message' => 'Transaction is already cancelled',
                ], 400);
            }

            // Restore inventory for products using centralized InventoryService
            foreach ($sale->items as $item) {
                if ($item->item_type === 'product' && $item->product_id) {
                    $inventoryService = new InventoryService();
                    $inventoryService->addStock(
                        $item->product_id,
                        $item->quantity,
                        'Sale Cancellation - ' . $request->reason,
                        'cancellation',
                        $sale->id
                    );
                }
            }

            // Mark payments as refunded
            foreach ($sale->payments as $payment) {
                $payment->processRefund();
            }

            // Update invoice status
            if ($sale->invoice) {
                $sale->invoice->cancel();
            }

            // Cancel the sale
            $sale->markAsCancelled($request->reason);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Transaction voided successfully',
                'transaction_id' => $sale->id,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Void failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Generate receipt data
     */
    private function generateReceiptData(Sale $sale, ?Payment $payment = null, ?Invoice $invoice = null)
    {
        $items = $sale->items->map(function ($item) {
            return [
                'name' => $item->item_name,
                'type' => $item->item_type,
                'quantity' => $item->quantity,
                'unit_price' => $item->unit_price,
                'discount' => $item->discount_amount,
                'total' => $item->total_price,
            ];
        });

        return [
            'store_name' => 'Pawesome Pet Store',
            'store_address' => '123 Pet Street, Manila, Philippines',
            'store_phone' => '(02) 8123-4567',
            'transaction_number' => $sale->transaction_number,
            'invoice_number' => $invoice?->invoice_number,
            'date' => $sale->created_at->format('Y-m-d H:i:s'),
            'cashier' => $sale->cashier?->name ?? 'Unknown',
            'customer' => [
                'name' => $sale->customer?->name ?? 'Walk-in',
                'email' => $sale->customer?->email,
                'phone' => $sale->customer?->phone,
            ],
            'items' => $items,
            'subtotal' => $sale->subtotal,
            'tax' => $sale->tax_amount,
            'discount' => $sale->discount_amount,
            'total' => $sale->total_amount,
            'payment' => [
                'method' => $payment?->payment_method ?? 'cash',
                'amount' => $payment?->amount ?? $sale->total_amount,
                'change' => $payment?->change_amount ?? 0,
                'reference' => $payment?->reference_number,
            ],
            'notes' => $sale->notes,
        ];
    }

    /**
     * Generate and download invoice PDF
     */
    public function downloadInvoice($id)
    {
        $sale = Sale::with(['items', 'invoice', 'customer', 'cashier'])->findOrFail($id);

        if (!$sale->invoice) {
            return response()->json(['message' => 'Invoice not found'], 404);
        }

        // For now, return JSON representation
        // In production, use a PDF library like DomPDF or Snappy
        return response()->json([
            'invoice' => [
                'number' => $sale->invoice->invoice_number,
                'date' => $sale->invoice->invoice_date,
                'due_date' => $sale->invoice->due_date,
                'status' => $sale->invoice->status,
                'store_info' => [
                    'name' => 'Pawesome Pet Store',
                    'address' => '123 Pet Street, Manila, Philippines',
                    'phone' => '(02) 8123-4567',
                    'email' => 'billing@pawesome.com',
                ],
                'customer' => [
                    'name' => $sale->customer?->name ?? 'Walk-in Customer',
                    'address' => $sale->customer?->address,
                    'email' => $sale->customer?->email,
                    'phone' => $sale->customer?->phone,
                ],
                'items' => $sale->items->map(function ($item) {
                    return [
                        'description' => $item->item_name,
                        'quantity' => $item->quantity,
                        'unit_price' => $item->unit_price,
                        'amount' => $item->total_price,
                    ];
                }),
                'subtotal' => $sale->subtotal,
                'tax' => $sale->tax_amount,
                'discount' => $sale->discount_amount,
                'total' => $sale->total_amount,
                'notes' => $sale->invoice->notes,
                'terms' => $sale->invoice->terms,
            ],
        ]);
    }
}
