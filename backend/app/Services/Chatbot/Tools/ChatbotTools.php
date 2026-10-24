<?php

namespace App\Services\Chatbot\Tools;

use App\Models\Appointment;
use App\Models\Boarding;
use App\Models\Customer;
use App\Models\CustomerOrder;
use App\Models\InventoryItem;
use App\Models\Pet;
use App\Models\Service;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\BookingAvailabilityService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Read-only AI tools (Groq function calling). Tools execute server-side as
 * the signed-in user and never mutate anything — booking only ever happens
 * through the existing confirm-click flow on ChatbotWorkflowController.
 */
class ChatbotTools
{
    private const TZ = 'Asia/Manila';

    /** OpenAI-compatible tool schemas filtered to what the role may call. */
    public static function definitions(string $role): array
    {
        $defs = [
            'get_my_requests' => [
                'roles' => ['customer'],
                'description' => 'Get the signed-in customer\'s service requests, store orders and boarding bookings with their status.',
                'params' => ['type' => 'object', 'properties' => new \stdClass()],
            ],
            'get_my_payments' => [
                'roles' => ['customer'],
                'description' => 'Get the signed-in customer\'s payment records and statuses.',
                'params' => ['type' => 'object', 'properties' => new \stdClass()],
            ],
            'get_services_prices' => [
                'roles' => ['customer', 'receptionist', 'cashier', 'inventory', 'veterinary', 'manager', 'admin', 'guest'],
                'description' => 'List available services and their prices.',
                'params' => ['type' => 'object', 'properties' => new \stdClass()],
            ],
            'check_availability' => [
                'roles' => ['customer', 'receptionist'],
                'description' => 'Check open appointment slots for a service on a date (YYYY-MM-DD or "today"/"tomorrow").',
                'params' => ['type' => 'object', 'properties' => [
                    'date' => ['type' => 'string'],
                    'service' => ['type' => 'string'],
                ], 'required' => ['date']],
            ],
            'search_inventory' => [
                'roles' => ['customer', 'receptionist', 'cashier', 'inventory', 'veterinary', 'manager', 'admin'],
                'description' => 'Search pet-store products by name, category or SKU.',
                'params' => ['type' => 'object', 'properties' => [
                    'query' => ['type' => 'string'],
                ], 'required' => ['query']],
            ],
            'get_today_queue' => [
                'roles' => ['receptionist', 'veterinary', 'manager', 'admin', 'cashier', 'inventory'],
                'description' => 'Today\'s appointment queue (staff only; vets see their own).',
                'params' => ['type' => 'object', 'properties' => new \stdClass()],
            ],
            'start_booking_flow' => [
                'roles' => ['customer'],
                'description' => 'Start an appointment booking for the customer. Returns a prefill action — the user still confirms in the widget.',
                'params' => ['type' => 'object', 'properties' => [
                    'pet' => ['type' => 'string', 'description' => 'pet name'],
                    'service' => ['type' => 'string', 'description' => 'service name'],
                    'date' => ['type' => 'string', 'description' => 'YYYY-MM-DD or "today"/"tomorrow"'],
                ]],
            ],
        ];

        return collect($defs)
            ->filter(fn ($d) => in_array($role, $d['roles'], true))
            ->map(fn ($d, $name) => ['type' => 'function', 'function' => [
                'name' => $name,
                'description' => $d['description'],
                'parameters' => $d['params'],
            ]])->values()->all();
    }

    /**
     * Execute a tool call. Returns ['data' => mixed, 'action' => ?array].
     */
    public static function execute(string $name, array $args, User $user, string $role): array
    {
        try {
            return match ($name) {
                'get_my_requests' => ['data' => self::myRequests($user)],
                'get_my_payments' => ['data' => self::myPayments($user)],
                'get_services_prices' => ['data' => self::servicesPrices()],
                'check_availability' => ['data' => self::checkAvailability($args)],
                'search_inventory' => ['data' => self::searchInventory($args['query'] ?? '', $role)],
                'get_today_queue' => ['data' => self::todayQueue($user, $role)],
                'start_booking_flow' => self::startBookingFlow($args, $user),
                default => ['data' => ['error' => 'unknown_tool']],
            };
        } catch (\Throwable $e) {
            return ['data' => ['error' => 'tool_failed']];
        }
    }

    // ─── Implementations ────────────────────────────────────────────────

    private static function customer(User $user): ?Customer
    {
        return Customer::where('email', $user->email)->first();
    }

    private static function myRequests(User $user): array
    {
        $owner = fn ($q) => $q->where('customer_id', $user->id)->orWhere('customer_email', $user->email);

        return [
            'service_requests' => ServiceRequest::where($owner)->latest()->limit(5)
                ->get(['id', 'service_name', 'request_type', 'status', 'payment_status'])
                ->map(fn ($r) => "#{$r->id} " . ($r->service_name ?? $r->request_type ?? 'Request') . " — {$r->status} / {$r->payment_status}")->all(),
            'orders' => Schema::hasTable('customer_orders')
                ? CustomerOrder::where($owner)->latest()->limit(3)->get(['id', 'status', 'payment_status'])
                    ->map(fn ($o) => "#{$o->id} — {$o->status} / {$o->payment_status}")->all() : [],
            'boardings' => Schema::hasTable('boardings')
                ? Boarding::where($owner)->latest()->limit(3)->get(['id', 'status', 'payment_status', 'check_in'])
                    ->map(fn ($b) => "#{$b->id} — {$b->status} / {$b->payment_status}")->all() : [],
        ];
    }

    private static function myPayments(User $user): array
    {
        $items = collect(self::myRequests($user))->flatten(1)->values()->all();

        return ['payments' => $items ?: ['No payment records found.']];
    }

    private static function servicesPrices(): array
    {
        return Service::where('is_active', true)->orderBy('name')->limit(15)
            ->get(['name', 'price'])
            ->map(fn ($s) => "{$s->name}: ₱" . number_format((float) $s->price, 2))->all();
    }

    private static function checkAvailability(array $args): array
    {
        $date = self::resolveDate($args['date'] ?? null);
        if (!$date) {
            return ['error' => 'unrecognized_date'];
        }

        $service = null;
        if (!empty($args['service'])) {
            $service = Service::where('name', 'like', '%' . $args['service'] . '%')->first();
        }
        $type = $service && strtolower((string) $service->category) === 'grooming' ? 'grooming' : 'veterinary';

        $slots = [];
        for ($h = 10; $h <= 17; $h++) {
            $time = sprintf('%02d:00', $h);
            if (BookingAvailabilityService::isServiceTimeAvailable($type, $date, $time, $service?->name)) {
                $slots[] = Carbon::parse($time)->format('g:i A');
            }
        }

        return ['date' => $date, 'service' => $service?->name ?? 'any', 'open_slots' => $slots ?: ['none']];
    }

    private static function searchInventory(string $query, string $role): array
    {
        $privileged = in_array($role, ['inventory', 'manager', 'admin'], true);

        return InventoryItem::where('status', '!=', 'archived')
            ->where(fn ($q) => $q->where('name', 'like', "%{$query}%")
                ->orWhere('category', 'like', "%{$query}%")
                ->orWhere('sku', 'like', "%{$query}%"))
            ->orderBy('name')->limit(5)->get()
            ->map(fn ($i) => $privileged
                ? "{$i->name} ({$i->sku}): {$i->stock} in stock — ₱" . number_format((float) $i->price, 2)
                : "{$i->name}: " . ($i->stock > 0 ? 'in stock' : 'out of stock') . ' — ₱' . number_format((float) $i->price, 2))
            ->all() ?: ['No matching products found.'];
    }

    private static function todayQueue(User $user, string $role): array
    {
        $q = Appointment::with(['pet:id,name', 'service:id,name'])
            ->whereDate('scheduled_at', Carbon::today(self::TZ))->orderBy('scheduled_at');

        if ($role === 'veterinary') {
            $q->where(fn ($b) => $b->whereNull('veterinarian_id')->orWhere('veterinarian_id', $user->id));
        }

        return $q->limit(8)->get()
            ->map(fn ($a) => optional($a->scheduled_at)->format('g:i A') . ' — ' . ($a->pet?->name ?? 'Pet') . ' — ' . ($a->service?->name ?? 'Service') . " ({$a->status})")
            ->all() ?: ['No appointments today.'];
    }

    private static function startBookingFlow(array $args, User $user): array
    {
        $customer = self::customer($user);
        if (!$customer) {
            return ['data' => ['error' => 'no_customer_profile']];
        }

        $payload = [];
        $missing = [];

        if (!empty($args['pet'])) {
            $pet = Pet::where('customer_id', $customer->id)
                ->where('name', 'like', '%' . $args['pet'] . '%')->first();
            $pet ? $payload['pet_id'] = $pet->id : $missing[] = 'pet';
        } else {
            $missing[] = 'pet';
        }

        if (!empty($args['service'])) {
            $svc = Service::where('is_active', true)
                ->where('name', 'like', '%' . $args['service'] . '%')->first();
            $svc ? $payload['service_id'] = $svc->id : $missing[] = 'service';
        } else {
            $missing[] = 'service';
        }

        if (!empty($args['date'])) {
            $date = self::resolveDate($args['date']);
            $date ? $payload['date'] = $date : $missing[] = 'date';
        }

        if ($missing !== []) {
            return ['data' => ['missing' => $missing, 'prefilled' => $payload]];
        }

        return [
            'data' => ['status' => 'ready', 'prefilled' => $payload],
            'action' => ['type' => 'prefill_booking', 'payload' => $payload],
        ];
    }

    private static function resolveDate(?string $raw): ?string
    {
        $raw = strtolower(trim((string) $raw));
        if ($raw === 'today' || $raw === 'ngayon') {
            return Carbon::today(self::TZ)->toDateString();
        }
        if ($raw === 'tomorrow' || $raw === 'bukas') {
            return Carbon::tomorrow(self::TZ)->toDateString();
        }
        try {
            return Carbon::parse($raw, self::TZ)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }
}
