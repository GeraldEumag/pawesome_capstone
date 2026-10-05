{{-- Status chip. Vars: $label (string), $tone (success|error|warning|info|neutral) --}}
@php
    $tones = [
        'success' => ['bg' => '#dcfce7', 'fg' => '#166534', 'bd' => '#86efac'],
        'error'   => ['bg' => '#fee2e2', 'fg' => '#991b1b', 'bd' => '#fca5a5'],
        'warning' => ['bg' => '#fef3c7', 'fg' => '#92400e', 'bd' => '#fcd34d'],
        'info'    => ['bg' => '#dbeafe', 'fg' => '#1e40af', 'bd' => '#93c5fd'],
        'neutral' => ['bg' => '#e5e7eb', 'fg' => '#374151', 'bd' => '#d1d5db'],
    ];
    $c = $tones[$tone ?? 'neutral'] ?? $tones['neutral'];
@endphp
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px 0;">
    <tr>
        <td style="background-color:{{ $c['bg'] }};border:1px solid {{ $c['bd'] }};border-radius:12px;padding:3px 12px;">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:{{ $c['fg'] }};">{{ $label }}</span>
        </td>
    </tr>
</table>
