@extends('emails.layout')

@section('title', 'Verify your email')

@section('content')
    <p>Hi {{ $name }},</p>
    <p>Thank you for registering with Pawesome. Please verify your email address by clicking the button below:</p>
    <p>
        <a href="{{ $url }}" class="button">Verify Email</a>
    </p>
    <p>This link will expire in 60 minutes.</p>
    <p>If you did not create this account, you can safely ignore this email.</p>
@endsection
