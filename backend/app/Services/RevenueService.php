<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Single source of truth for company revenue.
 *
 * Revenue lives in several places because not every payment flow creates a
 * `sales` row: POS checkout and appointment payments do (type 'product' /
 * 'appointment'), while store orders, service requests, hotel boardings and
 * medical confinements are paid by flagging `payment_status` on their own
 * tables. This service aggregates all of them so every report shows the
 * same figure.
 */
class RevenueService
{
    public const PAID_STATUSES = ['paid', 'verified', 'completed'];

    /** sales rows that are not revenue (refund records, split-payment mirrors) */
    private const SALES_EXCLUDED_TYPES = ['refund', 'multi_payment'];

    /**
     * 'appointment' sales were written by the legacy /appointments/{id}/pay
     * endpoint. Appointment revenue is owned by the `appointments` paid
     * source now, so those rows are excluded to prevent double counting.
     */
    private const SALES_SERVICE_TYPES = ['appointment'];

    /**
     * Total revenue for an optional date range (null bounds = all time).
     */
    public function total(?Carbon $from = null, ?Carbon $to = null): float
    {
        $total = $this->salesQuery($from, $to)->sum('sales.amount');

        foreach ($this->paidSources() as $source) {
            if ($source['amount'] !== null) {
                $total += (float) $this->paidQuery($source['table'], $source['amount'], $from, $to)->sum($source['amount']);
            }
        }

        $total += $this->partialSettlementQuery($from, $to)->sum('payment_settlements.amount');

        return (float) $total;
    }

    /**
     * Number of paid revenue records in a range (used for average order value).
     */
    public function count(?Carbon $from = null, ?Carbon $to = null): int
    {
        $count = (int) $this->salesQuery($from, $to)->count();

        foreach ($this->paidSources() as $source) {
            $count += (int) $this->paidQuery($source['table'], $source['amount'], $from, $to)->count();
        }

        $count += (int) $this->partialSettlementQuery($from, $to)->count();

        return $count;
    }

    /**
     * Daily revenue breakdown: 'Y-m-d' => ['revenue' => float, 'count' => int].
     */
    public function daily(Carbon $from, Carbon $to): array
    {
        $days = [];

        $merge = function ($rows) use (&$days) {
            foreach ($rows as $row) {
                $date = (string) $row->d;
                $days[$date]['revenue'] = ($days[$date]['revenue'] ?? 0) + (float) $row->total;
                $days[$date]['count'] = ($days[$date]['count'] ?? 0) + (int) $row->n;
            }
        };

        $merge($this->salesQuery($from, $to)
            ->selectRaw('DATE(sales.created_at) as d, SUM(sales.amount) as total, COUNT(*) as n')
            ->groupBy('d')
            ->get());

        $merge($this->partialSettlementQuery($from, $to)
            ->selectRaw('DATE(payment_settlements.created_at) as d, SUM(payment_settlements.amount) as total, COUNT(*) as n')
            ->groupBy('d')
            ->get());

        foreach ($this->paidSources() as $source) {
            if ($source['amount'] === null) {
                continue;
            }
            $merge($this->paidQuery($source['table'], $source['amount'], $from, $to)
                ->selectRaw("DATE({$source['table']}.created_at) as d, SUM({$source['amount']}) as total, COUNT(*) as n")
                ->groupBy('d')
                ->get());
        }

        ksort($days);
        return $days;
    }

    /**
     * Monthly totals for a calendar year: month (1-12) => amount.
     */
    public function monthly(int $year): array
    {
        $months = [];

        $merge = function ($rows) use (&$months) {
            foreach ($rows as $row) {
                $months[(int) $row->m] = ($months[(int) $row->m] ?? 0) + (float) $row->total;
            }
        };

        $merge($this->salesQuery(Carbon::create($year, 1, 1)->startOfDay(), Carbon::create($year, 12, 31)->endOfDay())
            ->selectRaw('MONTH(sales.created_at) as m, SUM(sales.amount) as total')
            ->groupBy('m')
            ->get());

        $merge($this->partialSettlementQuery(Carbon::create($year, 1, 1)->startOfDay(), Carbon::create($year, 12, 31)->endOfDay())
            ->selectRaw('MONTH(payment_settlements.created_at) as m, SUM(payment_settlements.amount) as total')
            ->groupBy('m')
            ->get());

        foreach ($this->paidSources() as $source) {
            if ($source['amount'] === null) {
                continue;
            }
            $merge($this->paidQuery($source['table'], $source['amount'], Carbon::create($year, 1, 1)->startOfDay(), Carbon::create($year, 12, 31)->endOfDay())
                ->selectRaw("MONTH({$source['table']}.created_at) as m, SUM({$source['amount']}) as total")
                ->groupBy('m')
                ->get());
        }

        return $months;
    }

    /**
     * Per-source totals for a range: 'pos'|'orders'|'services'|'boarding'|'confinement' => float.
     * Useful when a report wants to show where revenue came from.
     */
    public function breakdown(?Carbon $from = null, ?Carbon $to = null): array
    {
        $result = ['pos' => (float) $this->salesQuery($from, $to)->sum('sales.amount')];

        foreach ($this->paidSources() as $key => $source) {
            $result[$key] = $source['amount'] === null
                ? 0.0
                : (float) $this->paidQuery($source['table'], $source['amount'], $from, $to)->sum($source['amount']);
        }

        $result['partial_settlements'] = (float) $this->partialSettlementQuery($from, $to)->sum('payment_settlements.amount');

        return $result;
    }

    private function salesQuery(?Carbon $from, ?Carbon $to)
    {
        $query = DB::table('sales')
            ->whereNotIn('type', array_merge(self::SALES_EXCLUDED_TYPES, self::SALES_SERVICE_TYPES))
            ->whereNotIn('status', ['voided', 'cancelled']);

        $this->applyRange($query, 'sales.created_at', $from, $to);
        return $query;
    }

    /**
     * Non-sales revenue legs keyed by logical source name.
     */
    private function paidSources(): array
    {
        return [
            'orders' => ['table' => 'customer_orders', 'amount' => 'total_amount'],
            'services' => ['table' => 'service_requests', 'amount' => $this->firstColumn('service_requests', ['total_amount', 'price', 'service_price'])],
            'boarding' => ['table' => 'boardings', 'amount' => $this->firstColumn('boardings', ['total_amount', 'price', 'estimated_cost'])],
            'confinement' => ['table' => 'medical_confinements', 'amount' => $this->firstColumn('medical_confinements', ['final_amount', 'estimated_cost', 'total_amount'])],
            'veterinary' => ['table' => 'appointments', 'amount' => $this->firstColumn('appointments', ['total_amount', 'price'])],
            'grooming' => ['table' => 'groomings', 'amount' => $this->firstColumn('groomings', ['total_amount', 'amount'])],
        ];
    }

    private function paidQuery(string $table, ?string $amountColumn, ?Carbon $from, ?Carbon $to)
    {
        if (!Schema::hasTable($table) || $amountColumn === null) {
            // Empty result set
            return DB::query()->fromSub('select null as id, 0 as amount where 1 = 0', $table);
        }

        $query = DB::table($table)
            ->whereIn("$table.payment_status", self::PAID_STATUSES);

        // A service request fulfilled through a linked appointment, grooming,
        // or boarding record is billed there; skip the request itself to
        // avoid counting the same payment twice.
        if ($table === 'service_requests') {
            foreach (['boardings', 'groomings', 'appointments'] as $linked) {
                if (Schema::hasTable($linked) && Schema::hasColumn($linked, 'service_request_id') && Schema::hasColumn($linked, 'payment_status')) {
                    $query->whereNotExists(function ($sub) use ($linked) {
                        $sub->select(DB::raw(1))
                            ->from($linked)
                            ->whereColumn("$linked.service_request_id", 'service_requests.id')
                            ->whereIn("$linked.payment_status", self::PAID_STATUSES);
                    });
                }
            }
        }

        $this->applyRange($query, "$table.created_at", $from, $to);
        return $query;
    }

    /**
     * Settlements for services whose record is not yet fully paid — à la
     * carte item settlements that no service-table leg would otherwise
     * surface. When the record reaches 'paid' the whole amount is counted
     * by its own source leg, so these rows are deliberately excluded then.
     */
    private function partialSettlementQuery(?Carbon $from, ?Carbon $to)
    {
        $tableFor = [
            'boarding' => 'boardings',
            'appointment' => 'appointments',
            'veterinary' => 'appointments',
            'grooming' => 'groomings',
            'medical_confinement' => 'medical_confinements',
            'service_request' => 'service_requests',
        ];

        $query = DB::table('payment_settlements')
            ->where('payment_settlements.status', 'paid')
            ->whereIn('payment_settlements.settleable_type', array_keys($tableFor));

        foreach ($tableFor as $settleableType => $table) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'payment_status')) {
                continue;
            }
            $query->whereNotExists(function ($sub) use ($table, $settleableType) {
                $sub->select(DB::raw(1))
                    ->from($table)
                    ->whereColumn("$table.id", 'payment_settlements.settleable_id')
                    ->where('payment_settlements.settleable_type', $settleableType)
                    ->whereIn("$table.payment_status", self::PAID_STATUSES);
            });
        }

        $this->applyRange($query, 'payment_settlements.created_at', $from, $to);
        return $query;
    }

    private function applyRange($query, string $column, ?Carbon $from, ?Carbon $to): void
    {
        if ($from) {
            $query->where($column, '>=', $from->copy()->startOfDay());
        }
        if ($to) {
            $query->where($column, '<=', $to->copy()->endOfDay());
        }
    }

    private function firstColumn(string $table, array $candidates): ?string
    {
        if (!Schema::hasTable($table)) {
            return null;
        }
        foreach ($candidates as $column) {
            if (Schema::hasColumn($table, $column)) {
                return $column;
            }
        }
        return null;
    }
}
