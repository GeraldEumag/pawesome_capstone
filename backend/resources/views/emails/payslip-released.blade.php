@extends('emails.layout')

@section('title', 'Pawesome payslip released')

@section('content')
    <h1 style="font-size:20px;color:#b02a67;margin:0 0 16px 0;">Payslip Released</h1>

    <p style="margin:0 0 12px 0;">Hello{{ !empty($employeeName) ? ', ' . $employeeName : '' }},</p>

    <p style="margin:0 0 8px 0;">
        Your payslip for <strong>{{ $payPeriod }}</strong> is now available.
    </p>

    @include('emails.partials.details', ['rows' => [
        ['label' => 'Pay period', 'value' => $payPeriod ?? null],
        ['label' => 'Net pay', 'value' => '₱' . number_format((float) $netPay, 2)],
    ]])

    @include('emails.partials.cta', ['url' => $payslipUrl ?? null, 'label' => 'View Payslip'])

    <p class="muted small" style="margin:16px 0 0 0;">
        You can view your full payslip breakdown and previous payslips in the Pawesome HR portal.
    </p>
@endsection
