@extends('emails.layout')

@section('title', 'Pawesome payment receipt')

@section('content')
    <h1>Payment confirmed</h1>
    <p>Hi {{ $receipt['customer_name'] ?? 'Customer' }},</p>
    <p>Your payment has been verified. Please keep this receipt for your records.</p>
    <p><strong>Receipt #:</strong> {{ $receipt['receipt_number'] }}</p>

    @if (!empty($receipt['pet_name']) || !empty($receipt['service_name']))
        @if (!empty($receipt['pet_name']))
            <p><strong>Pet:</strong> {{ $receipt['pet_name'] }}</p>
        @endif
        @if (!empty($receipt['service_name']))
            <p><strong>Service:</strong> {{ $receipt['service_name'] }}</p>
        @endif
        @if (!empty($receipt['service_date']))
            <p><strong>Service date:</strong> {{ $receipt['service_date'] }}</p>
        @endif
    @endif

    @if (!empty($receipt['items']))
        <table>
            <thead>
                <tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
                @foreach ($receipt['items'] as $item)
                    <tr>
                        <td>{{ $item['product_name'] }}</td>
                        <td>{{ $item['quantity'] }}</td>
                        <td>₱{{ number_format((float) $item['price'], 2) }}</td>
                        <td>₱{{ number_format((float) $item['subtotal'], 2) }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <p class="amount">Total paid: ₱{{ number_format((float) $receipt['total_amount'], 2) }}</p>
    @if (!empty($receipt['payment_method']))
        <p><strong>Payment method:</strong> {{ $receipt['payment_method'] }}</p>
    @endif
    @if (!empty($receipt['payment_reference']))
        <p><strong>Reference:</strong> {{ $receipt['payment_reference'] }}</p>
    @endif
    @if (!empty($receipt['paid_at']))
        <p><strong>Paid:</strong> {{ \Illuminate\Support\Carbon::parse($receipt['paid_at'])->format('M d, Y h:i A') }}</p>
    @endif
@endsection
