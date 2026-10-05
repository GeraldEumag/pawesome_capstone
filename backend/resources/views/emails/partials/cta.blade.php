{{-- Primary call-to-action button. Vars: $url (string), $label (string). Renders nothing without a URL. --}}
@if (!empty($url))
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
        <td class="cta-btn" style="border-radius:6px;background-color:#d63384;">
            <a href="{{ $url }}" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">
                {{ $label ?? 'Open Pawesome' }}
            </a>
        </td>
    </tr>
</table>
@endif
