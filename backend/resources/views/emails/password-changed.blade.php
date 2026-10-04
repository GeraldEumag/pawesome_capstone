@extends('emails.layout')

@section('title', 'Your password was changed')

@section('content')
    <p>Hello{{ $name ? ' ' . $name : '' }},</p>
    <p>The password for your Pawesome account ({{ $email }}) was just changed, and all existing sign-in sessions were signed out.</p>
    <p>If you made this change, you can safely ignore this email.</p>
    <p>If you did <strong>not</strong> change your password, your account may be compromised — reset your password immediately and contact Pawesome support.</p>
@endsection
