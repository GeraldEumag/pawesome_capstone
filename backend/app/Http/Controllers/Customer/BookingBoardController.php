<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Api\ServiceRequestController;
use App\Http\Controllers\BoardingController;
use App\Http\Controllers\Controller;
use App\Services\BookingWorkflowStage;
use App\Services\ServiceDurationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * One customer-facing list of hotel, grooming, and vet bookings, using the
 * same workflow stages as the receptionist board. Each row carries the
 * actions the existing endpoints accept for it, so the UI never offers an
 * action the server would reject.
 */
class BookingBoardController extends Controller
{
    public const STAGES = ['to_approve', 'to_pay', 'on_going', 'ready_to_pickup', 'complete', 'canceled'];

    private const UPCOMING_DAYS = 60;
    private const PAID = ['paid', 'verified', 'completed'];
    private const PAYABLE = ['unpaid', 'rejected'];

    public function index(Request $request): JsonResponse
    {
        $service = (string) $request->query('service', '');
        $range = (string) $request->query('range', 'upcoming');
        $stage = (string) $request->query('stage', '');
        $today = Carbon::now(ServiceDurationService::STORE_TIMEZONE)->startOfDay();

        $items = collect(array_merge($this->serviceItems($request), $this->hotelItems($request)))
            ->filter(fn (array $item) => $service === '' || $item['kind'] === $service)
            ->filter(fn (array $item) => $this->inRange($item, $range, $today))
            ->values();

        $counts = ['all' => $items->count()];
        foreach (self::STAGES as $key) {
            $counts[$key] = $items->where('workflow_stage', $key)->count();
        }

        $shown = $stage !== ''
            ? $items->where('workflow_stage', $stage)->values()
            : $items;

        return response()->json([
            'success' => true,
            'store_today' => $today->toDateString(),
            'counts' => $counts,
            'items' => $shown->sortBy(fn (array $item) => ($item['date'] ?? '9999-12-31') . ' ' . ($item['time'] ?? ''))->values()->all(),
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    private function serviceItems(Request $request): array
    {
        $data = app(ServiceRequestController::class)->customerRequests($request)->getData(true);

        return collect($data['requests'] ?? [])->map(function (array $r) {
            $kind = $this->serviceKind((string) ($r['request_type'] ?? ''));
            $payment = strtolower((string) ($r['payment_status'] ?? 'unpaid'));
            $additional = (float) ($r['additional_charges'] ?? 0);
            $balance = in_array($payment, self::PAID, true) ? 0.0 : (float) ($r['price'] ?? 0);

            return [
                'key' => 'service_request-' . $r['id'],
                'source' => 'service_request',
                'kind' => $kind,
                'id' => $r['id'],
                'pet_name' => $r['pet_name'] ?? null,
                'title' => $r['service_name'] ?? $r['service'] ?? 'Service',
                'date' => $this->day($r['date'] ?? null),
                'time' => $r['time'] ?? null,
                'check_in' => null,
                'check_out' => null,
                'workflow_stage' => $r['workflow_stage'] ?? BookingWorkflowStage::TO_APPROVE,
                'status' => $r['status'] ?? null,
                'payment_status' => $payment,
                'amount_due' => round($balance + $additional, 2),
                'veterinarian' => $r['veterinarian']['name'] ?? null,
                'rejection_reason' => $r['rejection_reason'] ?? null,
                'actions' => $this->serviceActions($r, $additional),
                'updated_at' => $r['created_at'] ?? null,
            ];
        })->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function hotelItems(Request $request): array
    {
        $data = app(BoardingController::class)->index($request)->getData(true);

        return collect($data['data'] ?? [])->map(function (array $b) {
            $payment = strtolower((string) ($b['payment_status'] ?? 'unpaid'));
            $status = strtolower((string) ($b['status'] ?? ''));
            $balance = in_array($payment, self::PAID, true) ? 0.0 : (float) ($b['total_amount'] ?? 0);

            return [
                'key' => 'boarding-' . $b['id'],
                'source' => 'boarding',
                'kind' => 'hotel',
                'id' => $b['id'],
                'pet_name' => $b['pet_name'] ?? ($b['pet']['name'] ?? null),
                'title' => $b['room_name'] ?? 'Pet Hotel / Boarding',
                'date' => $this->day($b['check_in'] ?? null),
                'time' => null,
                'check_in' => $this->day($b['check_in'] ?? null),
                'check_out' => $this->day($b['check_out'] ?? null),
                'workflow_stage' => $b['workflow_stage'] ?? BookingWorkflowStage::TO_APPROVE,
                'status' => $status,
                'payment_status' => $payment,
                'amount_due' => round($balance, 2),
                'veterinarian' => null,
                'rejection_reason' => $b['rejection_reason'] ?? null,
                'actions' => $this->hotelActions($b, $status, $payment),
                'has_vaccination_card' => !empty($b['vaccination_card']),
                'vaccination_verified' => !empty($b['vaccination_card_verified_at']),
                'updated_at' => $b['updated_at'] ?? null,
            ];
        })->all();
    }

    /** Actions mirror the rules enforced by ServiceRequestController (cancel, payment proof). */
    private function serviceActions(array $r, float $additional): array
    {
        $status = strtolower((string) ($r['status'] ?? ''));
        $payment = strtolower((string) ($r['payment_status'] ?? 'unpaid'));
        $actions = [];

        if ($additional > 0) {
            $actions[] = 'view_bill';
        } elseif (in_array($status, ['approved', 'scheduled'], true) && in_array($payment, self::PAYABLE, true)) {
            $actions[] = 'pay';
        }
        if ($status === 'pending') {
            $actions[] = 'cancel';
        }

        return $actions;
    }

    /** Actions mirror BoardingController rules (cancel while pending, vaccination card, payment proof). */
    private function hotelActions(array $b, string $status, string $payment): array
    {
        $actions = [];

        if ($status === 'pending') {
            $actions[] = 'cancel';
            if (empty($b['vaccination_card_verified_at'])) {
                $actions[] = 'vaccination';
            }
        }
        if (in_array($status, ['approved', 'scheduled'], true) && in_array($payment, self::PAYABLE, true)) {
            $actions[] = 'pay';
        }
        if (in_array($status, ['checked_in', 'in_care', 'ready_for_pickup', 'completed'], true)) {
            $actions[] = 'care_logs';
        }

        return $actions;
    }

    private function inRange(array $item, string $range, Carbon $today): bool
    {
        $date = $item['date'];

        if ($range === 'upcoming' && $this->isLiveStay($item, $today)) {
            return true;
        }
        if ($date === null) {
            return $range === 'all';
        }

        $day = Carbon::parse($date);

        return match ($range) {
            'upcoming' => $day->gte($today) && $day->lte($today->copy()->addDays(self::UPCOMING_DAYS)),
            '7d' => $day->gte($today->copy()->subDays(6)) && $day->lte($today),
            '1m' => $day->gte($today->copy()->subMonthNoOverflow()) && $day->lte($today),
            default => true,
        };
    }

    private function isLiveStay(array $item, Carbon $today): bool
    {
        if ($item['kind'] !== 'hotel' || !in_array($item['workflow_stage'], ['on_going', 'ready_to_pickup'], true)) {
            return false;
        }

        return $item['check_in'] !== null
            && $item['check_in'] <= $today->toDateString()
            && $today->toDateString() <= ($item['check_out'] ?? $item['check_in']);
    }

    private function serviceKind(string $requestType): string
    {
        $type = strtolower($requestType);

        if (str_contains($type, 'groom')) return 'grooming';
        if (in_array($type, ['vet', 'veterinary'], true) || str_contains($type, 'veterinar') || str_contains($type, 'consult')) return 'vet';

        return 'service';
    }

    private function day(?string $value): ?string
    {
        return $value ? substr($value, 0, 10) : null;
    }
}
