@extends('emails.layout')

@section('title', 'Your password was changed')

@section('content')
    <h1 style="font-size:20px;color:#b02a67;margin:0 0 16px 0;">Password Changed</h1>

    <p style="margin:0 0 12px 0;">Hello{{ $name ? ' ' . $name : '' }},</p>

    @include('emails.partials.status-chip', ['label' => 'Security Alert', 'tone' => 'warning'])

    <p style="margin:0 0 8px 0;">
        The password for your Pawesome account was just changed, and all existing sign-in sessions were signed out.
    </p>

    @include('emails.partials.details', ['rows' => [
        ['label' => 'Account', 'value' => $email ?? null],
        ['label' => 'Changed on', 'value' => !empty($changedAt) ? \Illuminate\Support\Carbon::parse($changedAt)->format('M d, Y h:i A') : null],
    ]])

    <p style="margin:16px 0 8px 0;">If you made this change, you can safely ignore this email.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px 0;background-color:#fef3c7;border:1px solid #fcd34d;border-radius:8px;">
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#92400e;">
                <strong>Didn't make this change?</strong> Your account may be compromised — reset your password immediately using "Forgot password" on the login page and contact Pawesome support.
            </td>
        </tr>
    </table>

    <p style="margin:16px 0 0 0;">Thank you,</p>
    <p style="margin:4px 0 0 0;" class="muted">— The Pawesome Team</p>
@endsection
