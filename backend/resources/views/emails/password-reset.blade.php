<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset your password</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.5; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
        a.button { display: inline-block; padding: 12px 24px; background: #d63384; color: #fff; text-decoration: none; border-radius: 6px; }
        .footer { margin-top: 24px; font-size: 12px; color: #777; }
    </style>
</head>
<body>
    <div class="container">
        <p>Hello,</p>
        <p>You requested a password reset for your Pawesome account. Click the button below to choose a new password:</p>
        <p>
            <a href="{{ $url }}" class="button">Reset Password</a>
        </p>
        <p>This link will expire in {{ $expires }} minutes.</p>
        <p>If you did not request a password reset, you can safely ignore this email — your password will not change.</p>
        <div class="footer">
            — Pawesome Retreat Inc.
        </div>
    </div>
</body>
</html>
