<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>@yield('title', 'Pawesome')</title>
    <!--[if mso]>
    <style type="text/css">table { border-collapse: collapse; }</style>
    <![endif]-->
    <style>
        /* Client resets */
        body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; }
        img { border: 0; line-height: 100%; outline: none; text-decoration: none; }
        table { border-collapse: collapse; }

        /* Base typography (also inlined at the element level for clients that strip <style>) */
        body, td, p { font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.6; color: #333333; }
        h1, h2 { color: #b02a67; margin: 0 0 12px 0; }
        h1 { font-size: 22px; }
        h2 { font-size: 18px; }

        .muted { color: #6b7280; font-size: 13px; }
        .small { font-size: 13px; }

        /* Legacy aliases retained for existing templates */
        a.button, .cta-btn a { display: inline-block; padding: 12px 28px; background: #d63384; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; }
        .body { white-space: pre-line; }
        table.data { width: 100%; border-collapse: collapse; margin: 16px 0; }
        table.data th, table.data td { padding: 8px; border-bottom: 1px solid #eeeeee; text-align: left; }
        .amount { font-size: 18px; font-weight: 700; }
        .credentials { background: #fdf2f7; border: 1px solid #f5c6da; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }

        @media only screen and (max-width: 620px) {
            .container { width: 100% !important; }
            .content-pad { padding: 20px 16px !important; }
            .brand-tagline { display: none !important; }
        }
    </style>
</head>
<body bgcolor="#f3f4f6" style="margin:0;padding:0;background-color:#f3f4f6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6" style="background-color:#f3f4f6;">
        <tr>
            <td align="center" style="padding:24px 12px;">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="container" style="width:600px;max-width:100%;">

                    {{-- Brand header --}}
                    <tr>
                        <td style="padding:22px 24px 18px 24px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td width="52" valign="middle" style="width:52px;padding-right:12px;">
                                        <table role="presentation" width="44" height="44" cellpadding="0" cellspacing="0" bgcolor="#fff1f7" style="width:44px;height:44px;border:1px solid #f5c6da;border-radius:12px;">
                                            <tr><td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#b02a67;">PR</td></tr>
                                        </table>
                                    </td>
                                    <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;">
                                        <div style="font-size:22px;font-weight:bold;letter-spacing:2px;line-height:1.1;color:#b02a67;">PAWESOME</div>
                                        <div style="margin-top:4px;font-size:11px;font-weight:bold;letter-spacing:1.4px;color:#6b7280;">RETREAT INC.</div>
                                    </td>
                                    <td class="brand-tagline" align="right" valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#6b7280;">
                                        PET CARE<br>VETERINARY SERVICES
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 24px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr><td height="3" bgcolor="#d63384" style="font-size:3px;line-height:3px;">&nbsp;</td></tr>
                            </table>
                        </td>
                    </tr>

                    {{-- Content card --}}
                    <tr>
                        <td class="content-pad" bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;">
                            @yield('content')
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td align="center" style="padding:24px;">
                            <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;">
                                Questions? Reply to this message through your Pawesome account or contact our front desk during business hours.
                            </p>
                            <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;">
                                This is an automated notification from Pawesome. Please do not reply directly to this email.
                            </p>
                            <p style="margin:0;font-size:12px;color:#9ca3af;">
                                &copy; {{ date('Y') }} Pawesome Retreat Inc. All rights reserved.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
