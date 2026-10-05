{{-- Key/value details table. Var: $rows = [['label'=>..., 'value'=>...], ...]. Empty/null values are skipped. --}}
@php
    $rows = collect($rows ?? [])->filter(fn ($r) => isset($r['value']) && $r['value'] !== '' && $r['value'] !== null)->values();
@endphp
@if ($rows->isNotEmpty())
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:6px;">
    @foreach ($rows as $i => $row)
    <tr>
        <td width="40%" valign="top" style="padding:9px 12px;font-size:13px;color:#6b7280;{{ $i > 0 ? 'border-top:1px solid #f3f4f6;' : '' }}">
            {{ $row['label'] ?? '' }}
        </td>
        <td valign="top" style="padding:9px 12px;font-size:14px;color:#111827;font-weight:bold;{{ $i > 0 ? 'border-top:1px solid #f3f4f6;' : '' }}">
            {{ $row['value'] }}
        </td>
    </tr>
    @endforeach
</table>
@endif
