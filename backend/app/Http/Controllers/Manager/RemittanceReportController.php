<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Government remittance reports for SSS, PhilHealth, and Pag-IBIG.
 * Reads from the payrolls table (all contributions already computed) and
 * groups by month.
 */
class RemittanceReportController extends Controller
{
    /** GET /manager/reports/remittance?period=2026-09&type=sss|philhealth|pagibig */
    public function index(Request $request): JsonResponse
    {
        $period = $request->query('period', now()->format('Y-m'));
        $type   = $request->query('type', 'sss');

        [$year, $month] = explode('-', $period);
        $startDate = "{$year}-{$month}-01";
        $endDate   = \Carbon\Carbon::parse($startDate)->endOfMonth()->toDateString();

        $rows = DB::table('payrolls')
            ->whereBetween('pay_period_start', [$startDate, $endDate])
            ->whereNull('deleted_at')
            ->select([
                'employee_name',
                'user_id',
                'employee_id',
                'base_salary',
                'sss_contribution',
                'philhealth_contribution',
                'pagibig_contribution',
                'gross_pay',
            ])
            ->get();

        // For users, get government IDs from users table; for employees, from employees table
        $userIds     = $rows->whereNotNull('user_id')->pluck('user_id');
        $employeeIds = $rows->whereNotNull('employee_id')->pluck('employee_id');

        $userIds_arr = DB::table('users')->whereIn('id', $userIds)
            ->select('id', 'name', 'sss_no', 'philhealth_no', 'pagibig_no', 'tin')
            ->get()->keyBy('id');

        $empIds_arr = DB::table('employees')->whereIn('id', $employeeIds)
            ->select('id', 'first_name', 'last_name', 'sss_no', 'philhealth_no', 'pagibig_no', 'tin_no')
            ->get()->keyBy('id');

        $formatted = $rows->map(function ($row) use ($userIds_arr, $empIds_arr, $type) {
            $person = $row->user_id
                ? $userIds_arr->get($row->user_id)
                : $empIds_arr->get($row->employee_id);

            $govIds = [
                'sss_no'         => $person?->sss_no ?? null,
                'philhealth_no'  => $person?->philhealth_no ?? null,
                'pagibig_no'     => $person?->pagibig_no ?? null,
            ];

            $base = [
                'employee_name'  => $row->employee_name,
                'base_salary'    => (float) $row->base_salary,
                'gross_pay'      => (float) $row->gross_pay,
            ];

            return match ($type) {
                'sss' => array_merge($base, [
                    'sss_no'           => $govIds['sss_no'],
                    'employee_share'   => (float) $row->sss_contribution,
                    'employer_share'   => round((float) $row->sss_contribution * (8.5 / 5.0), 2), // ~8.5% employer
                    'total'            => round((float) $row->sss_contribution * (13.5 / 5.0), 2),
                ]),
                'philhealth' => array_merge($base, [
                    'philhealth_no'    => $govIds['philhealth_no'],
                    'employee_share'   => (float) $row->philhealth_contribution,
                    'employer_share'   => (float) $row->philhealth_contribution, // 50/50
                    'total'            => (float) $row->philhealth_contribution * 2,
                ]),
                'pagibig' => array_merge($base, [
                    'pagibig_no'       => $govIds['pagibig_no'],
                    'employee_share'   => (float) $row->pagibig_contribution,
                    'employer_share'   => (float) $row->pagibig_contribution, // 2% employer match
                    'total'            => (float) $row->pagibig_contribution * 2,
                ]),
                default => $base,
            };
        });

        $totals = [
            'employee_total' => $formatted->sum('employee_share'),
            'employer_total' => $formatted->sum('employer_share'),
            'grand_total'    => $formatted->sum('total'),
        ];

        return response()->json([
            'success' => true,
            'period'  => $period,
            'type'    => $type,
            'data'    => $formatted->values(),
            'totals'  => $totals,
        ]);
    }
}
