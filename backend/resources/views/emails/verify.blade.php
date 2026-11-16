@extends('emails.layout')

@section('title', 'Verify your email')

@section('content')
    <h1 style="font-size:20px;color:#b02a67;margin:0 0 16px 0;">Verify Your Email Address</h1>

    <p style="margin:0 0 12px 0;">Hi {{ $name }},</p>
    <p>Thank you for registering with Pawesome. Please verify your email address by clicking the button below:</p>
    <p>
        <a href="{{ $url }}" class="button">Verify Email</a>
    </p>
    <p>This link will expire in 60 minutes.</p>
    <p>If you did not create this account, you can safely ignore this email.</p>
@endsection
