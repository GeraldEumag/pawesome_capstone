<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payslip Released</title>
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .card { background: #fff; max-width: 520px; margin: 0 auto; padding: 32px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
        h2 { color: #7c3aed; margin-top: 0; }
        .amount { font-size: 2rem; font-weight: bold; color: #059669; }
        .btn { display: inline-block; background: #7c3aed; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin-top: 24px; font-weight: bold; }
        .footer { color: #888; font-size: 0.85rem; margin-top: 24px; }
    </style>
</head>
<body>
    <div class="card">
        <h2>Payslip Released 🎉</h2>
        <p>Hi <strong>{{ $employeeName }}</strong>,</p>
        <p>Your payslip for <strong>{{ $payPeriod }}</strong> is now available.</p>
        <p>Net Pay:</p>
        <p class="amount">₱{{ number_format($netPay, 2) }}</p>
        <a href="{{ $payslipUrl }}" class="btn">View Payslip</a>
        <p class="footer">
            You can view your full payslip breakdown and previous payslips in the Pawesome HR portal.<br>
            This is an automated email. Please do not reply.
        </p>
    </div>
</body>
</html>
