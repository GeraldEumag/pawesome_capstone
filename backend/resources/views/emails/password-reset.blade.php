@extends('emails.layout')

@section('title', 'Reset your password')

@section('content')
    <h1 style="font-size:20px;color:#b02a67;margin:0 0 16px 0;">Reset Your Password</h1>

    <p style="margin:0 0 12px 0;">Hello,</p>
    <p>You requested a password reset for your Pawesome account. Click the button below to choose a new password:</p>
    <p>
        <a href="{{ $url }}" class="button">Reset Password</a>
    </p>
    <p>This link will expire in {{ $expires }} minutes.</p>
    <p>If you did not request a password reset, you can safely ignore this email — your password will not change.</p>
@endsection
