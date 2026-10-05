PAWESOME — Pet Care & Veterinary Services

{{ $title }}
{{ str_repeat('=', strlen($title)) }}

Hello{{ !empty($content['customer_name']) ? ', ' . $content['customer_name'] : '' }},

{{ $content['intro'] ?? $body }}
@if (!empty($content['status']))

STATUS: {{ strtoupper($content['status']) }}
@endif
@php
    $rows = collect($content['details'] ?? [])->filter(fn ($r) => isset($r['value']) && $r['value'] !== '' && $r['value'] !== null);
@endphp
@if ($rows->isNotEmpty())

DETAILS
-------
@foreach ($rows as $row)
{{ $row['label'] ?? '' }}: {{ $row['value'] }}
@endforeach
@endif
@if (!empty($content['cta_url']))

{{ $content['cta_label'] ?? 'Open Pawesome' }}: {{ $content['cta_url'] }}
@endif

{{ $content['closing'] ?? 'You can log in to your Pawesome account at any time to view the complete details.' }}

Thank you for choosing Pawesome.
— The Pawesome Team

This is an automated notification from Pawesome. Please do not reply directly to this email.
© {{ date('Y') }} Pawesome Retreat Inc. All rights reserved.
