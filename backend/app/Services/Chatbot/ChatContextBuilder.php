<?php

namespace App\Services\Chatbot;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\CustomerOrder;
use App\Models\HotelRoom;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\Sale;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Builds the role-scoped live context injected into the AI system prompt.
 *
 * HARD RULE: a role only ever receives data it is allowed to see elsewhere
 * in the system. Revenue, other customers' records and occupancy details
 * never enter a customer or guest prompt.
 */
class ChatContextBuilder
{
    public static function build(?User $user, string $role): array
    {
        try {
            return match ($role) {
                'customer' => self::forCustomer($user),
                'receptionist', 'super_receptionist' => self::forReceptionist(),
                'veterinary' => self::forVeterinary($user),
                'cashier' => self::forCashier(),
                'inventory' => self::forInventory(),
                'manager', 'admin' => self::forManagement(),
                default => self::forPublic(),
            };
        } catch (\Throwable) {
            // Context is an enhancement — never break the message path.
            return [];
        }
    }

    /** Public-safe facts only — no counts tied to internal operations. */
    private static function forPublic(): array
    {
        return [
            'services' => Service::where('is_active', true)->orderBy('name')
                ->limit(12)->get(['name', 'price'])
                ->map(fn ($s) => ['name' => $s->name, 'price' => '₱' . number_format((float) $s->price, 2)])->all(),
        ];
    }

    private static function forCustomer(?User $user): array
    {
        if (!$user) {
            return self::forPublic();
        }

        $customer = Customer::where('email', $user->email)->first();
        $ctx = self::forPublic();

        if ($customer) {
            $ctx['my_pets'] = Pet::where('customer_id', $customer->id)
                ->orderBy('name')->limit(10)->get(['name', 'species', 'breed'])
                ->map(fn ($p) => trim("{$p->name} ({$p->species}" . ($p->breed ? " {$p->breed}" : '') . ')'))->all();

            $requests = ServiceRequest::where('customer_id', $user->id)
                ->orWhere('customer_email', $user->email)
                ->latest()->limit(5)->get();
            $ctx['my_requests'] = $requests->map(fn ($r) => [
                'label' => $r->service_name ?? $r->request_type ?? 'Service request',
                'status' => $r->status,
                'payment_status' => $r->payment_status ?? 'unpaid',
            ])->all();

            if (Schema::hasTable('customer_orders')) {
                $ctx['my_orders'] = CustomerOrder::where('customer_id', $user->id)
                    ->orWhere('customer_email', $user->email)
                    ->latest()->limit(3)->get(['id', 'status', 'payment_status'])
                    ->map(fn ($o) => "#{$o->id}: {$o->status} / {$o->payment_status}")->all();
            }

            if (Schema::hasTable('boardings')) {
                $ctx['my_boardings'] = Boarding::where('customer_id', $user->id)
                    ->orWhere('customer_email', $user->email)
                    ->latest()->limit(3)->get(['id', 'status', 'payment_status', 'check_in'])
                    ->map(fn ($b) => "#{$b->id}: {$b->status} / {$b->payment_status}")->all();
            }
        }

        return $ctx;
    }

    private static function forReceptionist(): array
    {
        $today = Carbon::today();

        return [
            'pending_approvals' => [
                'service_requests' => ServiceRequest::where('status', 'pending')->count(),
                'orders' => Schema::hasTable('customer_orders') ? CustomerOrder::where('status', 'pending')->count() : 0,
                'boardings' => Schema::hasTable('boardings') ? Boarding::where('status', 'pending')->count() : 0,
            ],
            'today_appointments' => [
                'count' => Appointment::whereDate('scheduled_at', $today)->count(),
            ],
            'hotel' => self::hotelStats(),
        ] + self::forPublic();
    }

    private static function forVeterinary(?User $user): array
    {
        return [
            'my_queue_today' => Appointment::whereDate('scheduled_at', Carbon::today())
                ->where(fn ($q) => $q->whereNull('veterinarian_id')->orWhere('veterinarian_id', $user?->id))
                ->orderBy('scheduled_at')->limit(8)->with(['pet:id,name', 'service:id,name'])->get()
                ->map(fn ($a) => optional($a->scheduled_at)->format('g:i A') . ' - ' . ($a->pet?->name ?? 'Pet') . ' - ' . ($a->service?->name ?? 'Service') . " ({$a->status})")->all(),
        ] + self::forPublic();
    }

    private static function forCashier(): array
    {
        return [
            'pending_payment_proofs' => ServiceRequest::where('payment_status', 'pending')->count()
                + (Schema::hasTable('customer_orders') ? CustomerOrder::where('payment_status', 'pending')->count() : 0)
                + (Schema::hasTable('boardings') ? Boarding::where('payment_status', 'pending')->count() : 0),
        ] + self::forPublic();
    }

    private static function forInventory(): array
    {
        return [
            'low_stock' => InventoryItem::where('status', '!=', 'archived')
                ->where('stock', '>', 0)->whereColumn('stock', '<=', 'reorder_level')
                ->orderBy('stock')->limit(8)->get(['name', 'stock', 'reorder_level'])
                ->map(fn ($i) => "{$i->name}: {$i->stock} left (reorder {$i->reorder_level})")->all(),
        ] + self::forPublic();
    }

    private static function forManagement(): array
    {
        $today = Carbon::today();

        return [
            'operations' => [
                'sales_today' => '₱' . number_format((float) Sale::whereDate('created_at', $today)->sum('amount'), 2),
                'appointments_today' => Appointment::whereDate('scheduled_at', $today)->count(),
                'pending_service_requests' => ServiceRequest::where('status', 'pending')->count(),
                'low_stock_items' => InventoryItem::where('status', '!=', 'archived')
                    ->where('stock', '>', 0)->whereColumn('stock', '<=', 'reorder_level')->count(),
            ],
            'hotel' => self::hotelStats(),
        ] + self::forPublic();
    }

    private static function hotelStats(): array
    {
        $total = HotelRoom::count();
        $occupied = HotelRoom::where('status', 'occupied')->count();

        return [
            'rooms_available' => HotelRoom::where('status', 'available')->count(),
            'occupancy_rate' => $total > 0 ? round(($occupied / $total) * 100) . '%' : '0%',
        ];
    }
}
