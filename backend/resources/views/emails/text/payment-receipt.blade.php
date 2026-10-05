PAWESOME — Pet Care & Veterinary Services

PAYMENT RECEIPT
===============

Hello{{ !empty($receipt['customer_name']) ? ', ' . $receipt['customer_name'] : '' }},

Your payment has been verified successfully. Please keep this receipt for your records.

Receipt number: {{ $receipt['receipt_number'] }}
@if (!empty($receipt['pet_name']))
Pet: {{ $receipt['pet_name'] }}
@endif
@if (!empty($receipt['service_name']))
Service: {{ $receipt['service_name'] }}
@endif
@if (!empty($receipt['service_date']))
Service date: {{ \Illuminate\Support\Carbon::parse($receipt['service_date'])->format('M d, Y') }}
@endif
@if (!empty($receipt['items']))

ITEMS
-----
@foreach ($receipt['items'] as $item)
{{ $item['product_name'] }}  x{{ $item['quantity'] }}  ₱{{ number_format((float) $item['price'], 2) }}  ₱{{ number_format((float) $item['subtotal'], 2) }}
@endforeach
@endif

TOTAL PAID: ₱{{ number_format((float) $receipt['total_amount'], 2) }}
@if (!empty($receipt['payment_method']))
Payment method: {{ $receipt['payment_method'] }}
@endif
@if (!empty($receipt['payment_reference']))
Payment reference: {{ $receipt['payment_reference'] }}
@endif
@if (!empty($receipt['paid_at']))
Paid on: {{ \Illuminate\Support\Carbon::parse($receipt['paid_at'])->format('M d, Y h:i A') }}
@endif

STATUS: PAID

Thank you for choosing Pawesome.
— The Pawesome Team

This is an automated notification. Please do not reply directly to this email.
© {{ date('Y') }} Pawesome Retreat Inc. All rights reserved.
