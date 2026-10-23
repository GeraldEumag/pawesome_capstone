<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\PaymentSettlement;
use App\Models\ServiceItemUsage;
use App\Models\VisitInvoice;
use App\Models\VisitInvoiceAdjustment;
use App\Models\VisitInvoiceLine;
use App\Models\ActivityLog;
use Illuminate\Support\Facades\DB;

/**
 * The visit invoice is the financial mirror of a veterinary appointment's
 * service_item_usages rows. It is materialized lazily and kept in lockstep by
 * sync(), which runs inside the same transaction as every billing mutation
 * (hooked from ServiceBillingService::syncServicePaymentState). Totals are
 * always derived server-side from the mirrored lines — never from the
 * client. version_hash lets clients detect stale invoice views.
 */
class VisitInvoiceService
{
    /**
     * Get or create the invoice for an appointment, then reconcile lines,
     * totals, settlements and the estimate threshold. Safe to call on every
     * billing sync — it only writes when the canonical state changed.
     */
    public static function sync(Appointment $appointment): VisitInvoice
    {
        $invoice = self::invoiceFor($appointment);

        $usages = ServiceItemUsage::where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
            ->where('service_id', $appointment->id)
            ->orderBy('id')
            ->get();

        $existing = $invoice->lines()->get()->keyBy('service_item_usage_id');

        foreach ($usages as $i => $usage) {
            $line = $existing->get($usage->id);
            $attrs = [
                'visit_invoice_id' => $invoice->id,
                'service_item_usage_id' => $usage->id,
                'item_type' => $usage->item_type,
                'description' => $usage->description
                    ?: ($usage->service_name_snapshot ?: ($usage->item_name_snapshot ?: 'Charge')),
                'quantity' => max(1, (int) ($usage->quantity_used ?? 1)),
                'unit_price' => (float) $usage->unit_price,
                'line_total' => (float) $usage->total_price,
                'is_billable' => (bool) $usage->is_billable,
                'is_paid' => (bool) $usage->is_paid,
                'sort_order' => $i,
            ];
            if ($line) {
                $line->update($attrs);
                $existing->forget($usage->id);
            } else {
                VisitInvoiceLine::create($attrs);
            }
        }
        // Lines whose usage rows were deleted are removed from the invoice.
        if ($existing->isNotEmpty()) {
            VisitInvoiceLine::whereIn('id', $existing->pluck('id'))->delete();
        }

        self::recompute($invoice);

        return $invoice->fresh('lines');
    }

    /**
     * Get-or-create under a row lock; invoice_number is sequential and
     * immutable once issued.
     */
    public static function invoiceFor(Appointment $appointment): VisitInvoice
    {
        $invoice = VisitInvoice::where('invoiceable_type', 'appointment')
            ->where('invoiceable_id', $appointment->id)
            ->lockForUpdate()
            ->first();

        if ($invoice) {
            return $invoice;
        }

        return VisitInvoice::create([
            'invoice_number' => self::nextInvoiceNumber(),
            'invoiceable_type' => 'appointment',
            'invoiceable_id' => $appointment->id,
            'customer_id' => $appointment->customer_id,
            'status' => VisitInvoice::STATUS_OPEN,
            'issued_at' => now(),
        ]);
    }

    /**
     * Fetch the invoice with lines, adjustments and linked settlements for
     * display. Also back-links any payment settlements recorded against this
     * appointment so the invoice view is always the reconciliation source.
     */
    public static function detail(Appointment $appointment): ?array
    {
        $invoice = VisitInvoice::where('invoiceable_type', 'appointment')
            ->where('invoiceable_id', $appointment->id)
            ->first();
        if (!$invoice) {
            return null;
        }

        // Link settlements recorded against the appointment to this invoice.
        PaymentSettlement::where('settleable_type', ServiceItemUsage::SERVICE_VETERINARY)
            ->where('settleable_id', $appointment->id)
            ->whereNull('visit_invoice_id')
            ->update(['visit_invoice_id' => $invoice->id]);

        $invoice->loadMissing(['lines', 'adjustments.requestedBy:id,name', 'adjustments.approvedBy:id,name']);
        $settlements = PaymentSettlement::where('visit_invoice_id', $invoice->id)
            ->orderBy('paid_at')
            ->get();

        return [
            'id' => $invoice->id,
            'invoice_number' => $invoice->invoice_number,
            'status' => $invoice->status,
            'subtotal' => (float) $invoice->subtotal,
            'discount_total' => (float) $invoice->discount_total,
            'total' => (float) $invoice->total,
            'amount_paid' => (float) $invoice->amount_paid,
            'balance_due' => (float) $invoice->balance_due,
            'version_hash' => $invoice->version_hash,
            'issued_at' => $invoice->issued_at,
            'settled_at' => $invoice->settled_at,
            'lines' => $invoice->lines->map(fn ($l) => [
                'id' => $l->id,
                'service_item_usage_id' => $l->service_item_usage_id,
                'item_type' => $l->item_type,
                'description' => $l->description,
                'quantity' => $l->quantity,
                'unit_price' => (float) $l->unit_price,
                'line_total' => (float) $l->line_total,
                'is_billable' => $l->is_billable,
                'is_paid' => $l->is_paid,
            ])->values()->all(),
            'adjustments' => $invoice->adjustments->map(fn ($a) => [
                'id' => $a->id,
                'type' => $a->type,
                'amount' => (float) $a->amount,
                'reason_code' => $a->reason_code,
                'notes' => $a->notes,
                'status' => $a->status,
                'requested_by' => $a->requestedBy?->name,
                'approved_by' => $a->approvedBy?->name,
                'created_at' => $a->created_at,
            ])->values()->all(),
            'settlements' => $settlements->map(fn ($s) => [
                'id' => $s->id,
                'amount' => (float) $s->amount,
                'status' => $s->status,
                'payment_method' => $s->payment_method,
                'reference_number' => $s->reference_number,
                'receipt_number' => $s->receipt_number,
                'paid_at' => $s->paid_at,
            ])->values()->all(),
        ];
    }

    /**
     * Request an adjustment. Below the configured limit discounts apply
     * immediately; waivers, write-offs and amounts at/over the limit stay
     * pending until a manager approves them.
     */
    public static function requestAdjustment(Appointment $appointment, array $data, int $userId, ?string $expectedVersionHash = null): VisitInvoiceAdjustment
    {
        return DB::transaction(function () use ($appointment, $data, $userId, $expectedVersionHash) {
            $locked = Appointment::where('id', $appointment->id)->lockForUpdate()->firstOrFail();
            $invoice = self::sync($locked);
            if ($invoice->status === VisitInvoice::STATUS_VOIDED) {
                throw new \RuntimeException('Cannot adjust a voided invoice');
            }
            if ($expectedVersionHash && $invoice->version_hash !== $expectedVersionHash) {
                throw new \RuntimeException('The bill changed since you opened it. Refresh and review the current invoice before adjusting.');
            }

            $type = $data['type'];
            $amount = round((float) $data['amount'], 2);
            if ($amount <= 0) {
                throw new \RuntimeException('Adjustment amount must be greater than zero');
            }
            $limit = (float) config('veterinary.adjustment_approval_limit', 500);
            $needsApproval = in_array($type, VisitInvoiceAdjustment::ALWAYS_REQUIRES_APPROVAL, true)
                || $amount >= $limit;

            $adjustment = VisitInvoiceAdjustment::create([
                'visit_invoice_id' => $invoice->id,
                'type' => $type,
                'amount' => $amount,
                'reason_code' => $data['reason_code'],
                'notes' => $data['notes'] ?? null,
                'status' => $needsApproval
                    ? VisitInvoiceAdjustment::STATUS_PENDING
                    : VisitInvoiceAdjustment::STATUS_APPROVED,
                'requested_by' => $userId,
            ]);

            if ($needsApproval) {
                WorkflowNotifier::notifyRole('manager', 'Invoice adjustment needs approval',
                    ucfirst(str_replace('_', ' ', $type)) . " of ₱" . number_format($amount, 2)
                        . " on invoice {$invoice->invoice_number} needs approval.",
                    'warning', 'visit_invoice', $invoice->id);
            } else {
                self::applyAdjustment($adjustment->fresh(), $userId);
            }

            return $adjustment->fresh();
        });
    }

    /**
     * Manager approval — applies the adjustment to the invoice.
     */
    public static function approveAdjustment(VisitInvoiceAdjustment $adjustment, int $managerId): VisitInvoiceAdjustment
    {
        return DB::transaction(function () use ($adjustment, $managerId) {
            $locked = VisitInvoiceAdjustment::where('id', $adjustment->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === VisitInvoiceAdjustment::STATUS_APPLIED) {
                return $locked;
            }
            if ($locked->status !== VisitInvoiceAdjustment::STATUS_PENDING) {
                throw new \RuntimeException('Only pending adjustments can be approved');
            }
            $locked->update([
                'status' => VisitInvoiceAdjustment::STATUS_APPROVED,
                'approved_by' => $managerId,
                'approved_at' => now(),
            ]);

            self::applyAdjustment($locked->fresh(), $managerId);

            return $locked->fresh();
        });
    }

    public static function rejectAdjustment(VisitInvoiceAdjustment $adjustment, int $managerId, ?string $reason): VisitInvoiceAdjustment
    {
        return DB::transaction(function () use ($adjustment, $managerId, $reason) {
            $locked = VisitInvoiceAdjustment::where('id', $adjustment->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== VisitInvoiceAdjustment::STATUS_PENDING) {
                throw new \RuntimeException('Only pending adjustments can be rejected');
            }
            $locked->update([
                'status' => VisitInvoiceAdjustment::STATUS_REJECTED,
                'approved_by' => $managerId,
                'approved_at' => now(),
                'notes' => trim(($locked->notes ? $locked->notes . ' ' : '') . '[Rejected] ' . ($reason ?? '')),
            ]);

            ActivityLog::log($managerId, 'invoice_adjustment_rejected',
                "{$locked->type} adjustment #{$locked->id} rejected" . ($reason ? ": {$reason}" : ''), [
                    'category' => 'billing',
                    'reference_type' => 'visit_invoice_adjustment',
                    'reference_id' => $locked->id,
                    'metadata' => ['amount' => (float) $locked->amount, 'reason_code' => $locked->reason_code],
                ]);

            return $locked;
        });
    }

    /**
     * Apply an approved adjustment as a discount line on the underlying
     * service usages, then resync. Credit notes are financial corrections and
     * apply the same way — receipt numbers are never rewritten.
     */
    private static function applyAdjustment(VisitInvoiceAdjustment $adjustment, int $actorId): void
    {
        if ($adjustment->status === VisitInvoiceAdjustment::STATUS_APPLIED) {
            return;
        }

        $invoice = $adjustment->invoice;
        $appointment = Appointment::findOrFail($invoice->invoiceable_id);

        // Same guard as ServiceBillingService::addBillingItem — a discount
        // can never exceed the remaining billable amount.
        $gross = (float) ServiceItemUsage::where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
            ->where('service_id', $appointment->id)
            ->billable()
            ->sum('total_price');
        $existingDiscounts = (float) ServiceItemUsage::where('service_type', ServiceItemUsage::SERVICE_VETERINARY)
            ->where('service_id', $appointment->id)
            ->where('item_type', ServiceItemUsage::ITEM_DISCOUNT)
            ->sum('total_price');
        if ($gross - $existingDiscounts - (float) $adjustment->amount < 0) {
            throw new \RuntimeException('Adjustment exceeds the remaining billable amount');
        }

        // Adjustments are authorized by their own approval flow — writing
        // the discount line directly avoids the staff-facing billing auth
        // check (which would reject the approving manager's role).
        $label = ucfirst(str_replace('_', ' ', $adjustment->type));
        $usage = ServiceItemUsage::create([
            'service_type' => ServiceItemUsage::SERVICE_VETERINARY,
            'service_id' => $appointment->id,
            'pet_id' => $appointment->pet_id,
            'customer_id' => $appointment->customer_id,
            'inventory_item_id' => null,
            'batch_id' => null,
            'quantity_used' => 1,
            'unit' => 'pcs',
            'used_by' => $actorId,
            'notes' => "Invoice adjustment #{$adjustment->id}: " . ($adjustment->notes ?? ''),
            'item_type' => ServiceItemUsage::ITEM_DISCOUNT,
            'description' => "{$label} ({$adjustment->reason_code})",
            'unit_price' => (float) $adjustment->amount,
            'total_price' => (float) $adjustment->amount,
            'is_billable' => false,
            'is_paid' => false,
        ]);

        ServiceBillingService::syncServicePaymentState(ServiceItemUsage::SERVICE_VETERINARY, $appointment->id);

        $adjustment->update([
            'status' => VisitInvoiceAdjustment::STATUS_APPLIED,
            'applied_at' => now(),
            'service_item_usage_id' => $usage->id,
        ]);

        ActivityLog::log($actorId, 'invoice_adjustment_applied',
            "{$adjustment->type} adjustment #{$adjustment->id} applied to {$invoice->invoice_number}", [
                'category' => 'billing',
                'reference_type' => 'visit_invoice',
                'reference_id' => $invoice->id,
                'metadata' => ['amount' => (float) $adjustment->amount, 'reason_code' => $adjustment->reason_code],
            ]);
    }

    /**
     * Recompute invoice totals from the canonical lines and update the
     * version hash + status. Called inside the billing transaction.
     */
    private static function recompute(VisitInvoice $invoice): void
    {
        $lines = $invoice->lines()->get();
        $subtotal = (float) $lines->where('is_billable', true)->sum('line_total');
        $discount = (float) $lines->where('item_type', ServiceItemUsage::ITEM_DISCOUNT)->sum('line_total');
        $total = max(0.0, round($subtotal - $discount, 2));
        $paid = (float) $lines->where('is_billable', true)->where('is_paid', true)->sum('line_total')
            - (float) $lines->where('item_type', ServiceItemUsage::ITEM_DISCOUNT)->where('is_paid', true)->sum('line_total');
        $paid = max(0.0, round($paid, 2));
        $balance = round(max(0.0, $total - $paid), 2);

        $status = $invoice->status;
        if ($status !== VisitInvoice::STATUS_VOIDED) {
            $status = $balance <= 0 && $total > 0
                ? VisitInvoice::STATUS_SETTLED
                : ($paid > 0 ? VisitInvoice::STATUS_PARTIALLY_PAID : VisitInvoice::STATUS_OPEN);
        }

        $hash = sha1(json_encode([
            'total' => $total,
            'paid' => $paid,
            'balance' => $balance,
            'lines' => $lines->map(fn ($l) => [
                $l->service_item_usage_id, $l->item_type,
                (string) $l->line_total, (int) $l->is_paid,
            ])->values()->all(),
        ]));

        $invoice->update([
            'subtotal' => round($subtotal, 2),
            'discount_total' => round($discount, 2),
            'total' => $total,
            'amount_paid' => $paid,
            'balance_due' => $balance,
            'status' => $status,
            'version_hash' => $hash,
            'settled_at' => $status === VisitInvoice::STATUS_SETTLED ? ($invoice->settled_at ?? now()) : null,
        ]);

        VisitEstimateService::evaluateThreshold(Appointment::find($invoice->invoiceable_id));
    }

    private static function nextInvoiceNumber(): string
    {
        $year = now()->format('Y');
        $max = VisitInvoice::where('invoice_number', 'like', "VINV-{$year}-%")
            ->lockForUpdate()
            ->max('invoice_number');
        $seq = $max ? ((int) substr($max, -5)) + 1 : 1;

        return sprintf('VINV-%s-%05d', $year, $seq);
    }
}
