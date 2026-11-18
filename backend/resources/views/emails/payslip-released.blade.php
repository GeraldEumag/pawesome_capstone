@extends('emails.layout')

@section('title', 'Pawesome payslip released')

@section('content')
    <h1 style="font-size:20px;color:#b02a67;margin:0 0 16px 0;">Payslip Released</h1>

    <p style="margin:0 0 12px 0;">Hello{{ !empty($employeeName) ? ', ' . $employeeName : '' }},</p>

    @include('emails.partials.status-chip', ['label' => 'Paid', 'tone' => 'success'])

    <p style="margin:0 0 8px 0;">
        Your payslip for <strong>{{ $payPeriod }}</strong> is now available.
        The complete payslip is attached as a PDF for you to open or download directly.
    </p>

    {{-- Net pay hero block --}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fdf2f7;border:1px solid #f5c6da;border-radius:8px;">
        <tr>
            <td align="center" style="padding:20px 16px 6px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#6b7280;">
                Net Pay
            </td>
        </tr>
        <tr>
            <td align="center" style="padding:0 16px 20px 16px;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:bold;line-height:1.2;color:#b02a67;">
                ₱{{ number_format((float) $netPay, 2) }}
            </td>
        </tr>
    </table>

    @include('emails.partials.details', ['rows' => [
        ['label' => 'Pay period', 'value' => $payPeriod ?? null],
        ['label' => 'Payroll reference', 'value' => $payrollRef ?? null],
        ['label' => 'Gross pay', 'value' => isset($grossPay) ? '₱' . number_format((float) $grossPay, 2) : null],
        ['label' => 'Payment method', 'value' => $paymentMethod ?? null],
        ['label' => 'Paid on', 'value' => !empty($paidAt) ? \Illuminate\Support\Carbon::parse($paidAt)->format('M d, Y') : null],
    ]])

    <p class="muted small" style="margin:16px 0 0 0;">
        The attached file and this message contain confidential payroll information — please do not forward them.
    </p>

    <p style="margin:16px 0 0 0;">Thank you,</p>
    <p style="margin:4px 0 0 0;" class="muted">— Pawesome Payroll</p>
@endsection
