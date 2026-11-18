PAWESOME — Pet Care & Veterinary Services

PAYSLIP RELEASED
================

Hello{{ !empty($employeeName) ? ', ' . $employeeName : '' }},

Your payslip for {{ $payPeriod }} is now available. Status: PAID.

NET PAY: ₱{{ number_format((float) $netPay, 2) }}

Pay period: {{ $payPeriod }}
@if (!empty($payrollRef))
Payroll reference: {{ $payrollRef }}
@endif
@if (isset($grossPay))
Gross pay: ₱{{ number_format((float) $grossPay, 2) }}
@endif
@if (!empty($paymentMethod))
Payment method: {{ $paymentMethod }}
@endif
@if (!empty($paidAt))
Paid on: {{ \Illuminate\Support\Carbon::parse($paidAt)->format('M d, Y') }}
@endif

Your complete payslip is attached as a PDF. Open the attachment to view or download it directly.

The attached file and this message contain confidential payroll information — please do not forward them.

— Pawesome Payroll
This is an automated notification. Please do not reply directly to this email.
© {{ date('Y') }} Pawesome Retreat Inc. All rights reserved.
