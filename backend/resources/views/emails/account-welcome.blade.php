@extends('emails.layout')

@section('title', 'Your Pawesome account')

@section('content')
    <h1 style="font-size:20px;color:#b02a67;margin:0 0 16px 0;">Welcome to Pawesome</h1>

    <p style="margin:0 0 12px 0;">Hi {{ $name }},</p>
    <p>An account has been created for you on Pawesome Retreat Inc.</p>
    <div class="credentials">
        <p style="margin: 0;"><strong>Username:</strong> {{ $username }}</p>
        <p style="margin: 0;"><strong>Role:</strong> {{ ucwords(str_replace('_', ' ', $role)) }}</p>
    </div>
    <p>For security, your initial password was set by the administrator. Use the button below to set your own password:</p>
    <p>
        <a href="{{ $url }}" class="button">Set Your Password</a>
    </p>
    <p>This link will expire in {{ $expires }} minutes. If it expires, use the "Forgot password" option on the login page.</p>
    <p>If you were not expecting this account, you can safely ignore this email.</p>
@endsection
