<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\ClinicPaymentAccount;
use App\Models\ProviderConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Manager-editable receipt-scanner configuration: provider patterns/labels,
 * clinic wallet accounts, thresholds — plus the accuracy/review metrics the
 * thesis evaluation reports on.
 */
class ReceiptSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json([
            'enabled' => (bool) config('receipt_scanner.enabled'),
            'chain' => config('receipt_scanner.chain', ['vision', 'ocr']),
            'thresholds' => config('receipt_scanner.thresholds'),
            'date_window_days' => config('receipt_scanner.date_window_days'),
            'max_uploads_per_payable' => config('receipt_scanner.max_uploads_per_payable'),
            'providers' => ProviderConfig::orderBy('provider')->get(),
            'clinic_accounts' => ClinicPaymentAccount::orderBy('provider')->get(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'providers' => 'sometimes|array',
            'providers.*.provider' => 'required|string|in:gcash,maya',
            'providers.*.reference_pattern' => 'nullable|string|max:255',
            'providers.*.min_length' => 'nullable|integer|min:1|max:255',
            'providers.*.max_length' => 'nullable|integer|min:1|max:255',
            'providers.*.reference_labels' => 'nullable|array',
            'providers.*.reference_labels.*' => 'string|max:100',
            'providers.*.accepted_status_texts' => 'nullable|array',
            'providers.*.accepted_status_texts.*' => 'string|max:100',
            'providers.*.confusion_map' => 'nullable|array',
            'providers.*.active' => 'boolean',
            'clinic_accounts' => 'sometimes|array',
            'clinic_accounts.*.id' => 'nullable|integer',
            'clinic_accounts.*.provider' => 'required|string|in:gcash,maya',
            'clinic_accounts.*.account_name' => 'required|string|max:255',
            'clinic_accounts.*.account_last4' => 'nullable|string|max:8',
            'clinic_accounts.*.active' => 'boolean',
        ]);

        DB::transaction(function () use ($validated) {
            foreach ($validated['providers'] ?? [] as $providerData) {
                ProviderConfig::updateOrCreate(
                    ['provider' => $providerData['provider']],
                    [
                        'reference_pattern' => $providerData['reference_pattern'] ?? null,
                        'min_length' => $providerData['min_length'] ?? null,
                        'max_length' => $providerData['max_length'] ?? null,
                        'reference_labels' => $providerData['reference_labels'] ?? null,
                        'accepted_status_texts' => $providerData['accepted_status_texts'] ?? null,
                        'confusion_map' => $providerData['confusion_map'] ?? null,
                        'active' => $providerData['active'] ?? true,
                    ]
                );
            }

            $keptIds = [];
            foreach ($validated['clinic_accounts'] ?? [] as $accountData) {
                $account = isset($accountData['id'])
                    ? ClinicPaymentAccount::find($accountData['id'])
                    : null;
                $account = $account ?? new ClinicPaymentAccount(['provider' => $accountData['provider']]);
                $account->fill([
                    'provider' => $accountData['provider'],
                    'account_name' => $accountData['account_name'],
                    'account_last4' => $accountData['account_last4'] ?? null,
                    'active' => $accountData['active'] ?? true,
                ]);
                $account->save();
                $keptIds[] = $account->id;
            }

            // Accounts absent from the submitted list are deactivated, not
            // deleted — validation history stays intact.
            if (array_key_exists('clinic_accounts', $validated)) {
                ClinicPaymentAccount::whereNotIn('id', $keptIds)->update(['active' => false]);
            }
        });

        ActivityLog::log(Auth::id(), 'receipt_settings_updated', 'Receipt scanner settings updated', [
            'category' => 'settings',
            'reference_type' => 'receipt_scanner',
        ]);

        return $this->show();
    }

    /**
     * Accuracy and review-rate dashboard data: auto-fill rate, correction
     * rate, flagged rate, average processing time — split per reader so the
     * vision/OCR comparison for the thesis is free.
     */
    public function metrics(): JsonResponse
    {
        $receipts = DB::table('payment_receipts');
        $total = (clone $receipts)->count();

        $extractions = DB::table('receipt_extractions')
            ->whereNotNull('reference_normalized');

        $corrections = DB::table('receipt_corrections')->count();

        $statusCounts = DB::table('payment_receipts')
            ->select('status', DB::raw('count(*) as n'))
            ->groupBy('status')
            ->pluck('n', 'status');

        $perReader = DB::table('receipt_extractions')
            ->whereNotNull('reader')
            ->select(
                'reader',
                DB::raw('count(*) as reads'),
                DB::raw('sum(case when reference_normalized is not null then 1 else 0 end) as with_reference'),
                DB::raw('round(avg(latency_ms)) as avg_latency_ms')
            )
            ->groupBy('reader')
            ->get()
            ->map(fn ($row) => [
                'reader' => $row->reader,
                'reads' => (int) $row->reads,
                'with_reference' => (int) $row->with_reference,
                'auto_fill_rate' => $row->reads > 0 ? round($row->with_reference / $row->reads, 4) : null,
                'avg_latency_ms' => $row->avg_latency_ms !== null ? (int) $row->avg_latency_ms : null,
            ]);

        $validationCounts = DB::table('receipt_validations')
            ->select('result', DB::raw('count(*) as n'))
            ->groupBy('result')
            ->pluck('n', 'result');

        $flaggedReceipts = DB::table('receipt_validations')
            ->whereIn('result', ['warning', 'block'])
            ->distinct('receipt_id')
            ->count('receipt_id');

        return response()->json([
            'total_receipts' => $total,
            'auto_filled' => (int) (clone $extractions)->distinct('receipt_id')->count('receipt_id'),
            'auto_fill_rate' => $total > 0 ? round((clone $extractions)->distinct('receipt_id')->count('receipt_id') / $total, 4) : null,
            'correction_rate' => $total > 0 ? round($corrections / $total, 4) : null,
            'corrections' => $corrections,
            'flagged_rate' => $total > 0 ? round($flaggedReceipts / $total, 4) : null,
            'flagged_receipts' => $flaggedReceipts,
            'status_counts' => $statusCounts,
            'validation_counts' => $validationCounts,
            'per_reader' => $perReader,
        ]);
    }
}
