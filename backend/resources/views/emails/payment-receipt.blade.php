<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pawesome payment receipt</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.5; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
        h1 { color: #d63384; font-size: 22px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
        .amount { font-size: 18px; font-weight: 700; }
        .footer { margin-top: 24px; font-size: 12px; color: #777; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Payment confirmed</h1>
        <p>Hi {{ $receipt['customer_name'] ?? 'Customer' }},</p>
        <p>Your payment has been verified. Please keep this receipt for your records.</p>
        <p><strong>Receipt #:</strong> {{ $receipt['receipt_number'] }}</p>

        @if ($receiptType === 'customer_order')
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
        @else
            <p><strong>Pet:</strong> {{ $receipt['pet_name'] ?? '—' }}</p>
            <p><strong>Service:</strong> {{ $receipt['service_name'] }}</p>
            @if (!empty($receipt['service_date']))
                <p><strong>Service date:</strong> {{ $receipt['service_date'] }}</p>
            @endif
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

        <div class="footer">— Pawesome Retreat Inc.</div>
    </div>
</body>
</html>
