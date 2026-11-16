PAWESOME — Pet Care & Veterinary Services

PASSWORD CHANGED
================

Hello{{ $name ? ' ' . $name : '' }},

The password for your Pawesome account was just changed, and all existing sign-in sessions were signed out.

Account: {{ $email }}
@if (!empty($changedAt))
Changed on: {{ \Illuminate\Support\Carbon::parse($changedAt)->format('M d, Y h:i A') }}
@endif

If you made this change, you can safely ignore this email.

DIDN'T MAKE THIS CHANGE? Your account may be compromised — reset your password immediately using "Forgot password" on the login page and contact Pawesome support.

— The Pawesome Team
This is an automated notification. Please do not reply directly to this email.
© {{ date('Y') }} Pawesome Retreat Inc. All rights reserved.
