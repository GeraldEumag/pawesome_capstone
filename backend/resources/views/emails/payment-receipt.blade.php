@extends('emails.layout')

@section('title', 'Pawesome payment receipt')

@section('content')
    <h1 style="font-size:20px;color:#b02a67;margin:0 0 16px 0;">Payment Confirmed</h1>

    <p style="margin:0 0 12px 0;">Hello{{ !empty($receipt['customer_name']) ? ', ' . $receipt['customer_name'] : '' }},</p>

    @include('emails.partials.status-chip', ['label' => 'Paid', 'tone' => 'success'])

    <p style="margin:0 0 8px 0;">
        Your payment has been verified successfully. Please keep this receipt for your records.
    </p>

    @include('emails.partials.details', ['rows' => [
        ['label' => 'Receipt number', 'value' => $receipt['receipt_number'] ?? null],
        ['label' => 'Pet', 'value' => $receipt['pet_name'] ?? null],
        ['label' => 'Service', 'value' => $receipt['service_name'] ?? null],
        ['label' => 'Service date', 'value' => !empty($receipt['service_date']) ? \Illuminate\Support\Carbon::parse($receipt['service_date'])->format('M d, Y') : null],
    ]])

    @if (!empty($receipt['items']))
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="data" style="margin:16px 0;border:1px solid #e5e7eb;">
            <thead>
                <tr>
                    <th align="left" style="padding:8px 10px;font-size:12px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Item</th>
                    <th align="center" style="padding:8px 10px;font-size:12px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Qty</th>
                    <th align="right" style="padding:8px 10px;font-size:12px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Unit price</th>
                    <th align="right" style="padding:8px 10px;font-size:12px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Subtotal</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($receipt['items'] as $item)
                    <tr>
                        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">{{ $item['product_name'] }}</td>
                        <td align="center" style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">{{ $item['quantity'] }}</td>
                        <td align="right" style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">₱{{ number_format((float) $item['price'], 2) }}</td>
                        <td align="right" style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">₱{{ number_format((float) $item['subtotal'], 2) }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
        <tr>
            <td style="font-size:16px;font-weight:bold;color:#111827;">Total paid</td>
            <td align="right" style="font-size:18px;font-weight:bold;color:#b02a67;">₱{{ number_format((float) $receipt['total_amount'], 2) }}</td>
        </tr>
    </table>

    @include('emails.partials.details', ['rows' => [
        ['label' => 'Payment method', 'value' => $receipt['payment_method'] ?? null],
        ['label' => 'Payment reference', 'value' => $receipt['payment_reference'] ?? null],
        ['label' => 'Paid on', 'value' => !empty($receipt['paid_at']) ? \Illuminate\Support\Carbon::parse($receipt['paid_at'])->format('M d, Y h:i A') : null],
    ]])

    <p style="margin:16px 0 0 0;">Thank you for choosing Pawesome.</p>
    <p style="margin:4px 0 0 0;" class="muted">— The Pawesome Team</p>
@endsection
