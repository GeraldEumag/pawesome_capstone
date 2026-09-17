<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Pawesome account</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.5; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
        a.button { display: inline-block; padding: 12px 24px; background: #d63384; color: #fff; text-decoration: none; border-radius: 6px; }
        .credentials { background: #fdf2f7; border: 1px solid #f5c6da; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
        .footer { margin-top: 24px; font-size: 12px; color: #777; }
    </style>
</head>
<body>
    <div class="container">
        <p>Hi {{ $name }},</p>
        <p>An account has been created for you on Pawesome Retreat Inc.</p>
        <div class="credentials">
            <p style="margin: 0;"><strong>Username:</strong> {{ $username }}</p>
            <p style="margin: 0;"><strong>Role:</strong> {{ ucwords(str_replace('_', ' ', $role)) }}</p>
        </div>
        <p>For security, your initial password was set by the administrator. Use the button below to set your own password:</p>
        <p>
            <a href="{{ $url }}" class="button">Set Your Password</a>
        </p>
        <p>This link will expire in {{ $expires }} minutes. If it expires, use the "Forgot password" option on the login page.</p>
        <p>If you were not expecting this account, you can safely ignore this email.</p>
        <div class="footer">
            — Pawesome Retreat Inc.
        </div>
    </div>
</body>
</html>
