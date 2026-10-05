@extends('emails.layout')

@section('title', $title)

@section('content')
    <h1 style="font-size:20px;color:#b02a67;margin:0 0 16px 0;">{{ $title }}</h1>

    <p style="margin:0 0 12px 0;">Hello{{ !empty($content['customer_name']) ? ', ' . $content['customer_name'] : '' }},</p>

    @if (!empty($content['status']))
        @include('emails.partials.status-chip', [
            'label' => $content['status'],
            'tone' => $content['status_type'] ?? 'neutral',
        ])
    @endif

    <p class="body" style="margin:0 0 8px 0;">{{ $content['intro'] ?? $body }}</p>

    @include('emails.partials.details', ['rows' => $content['details'] ?? []])

    @include('emails.partials.cta', [
        'url' => $content['cta_url'] ?? null,
        'label' => $content['cta_label'] ?? null,
    ])

    <p style="margin:8px 0 0 0;" class="body">{{ $content['closing'] ?? 'You can log in to your Pawesome account at any time to view the complete details.' }}</p>

    <p style="margin:16px 0 0 0;">Thank you for choosing Pawesome.</p>
    <p style="margin:4px 0 0 0;" class="muted">— The Pawesome Team</p>
@endsection
