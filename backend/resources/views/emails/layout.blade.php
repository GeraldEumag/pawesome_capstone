<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', 'Pawesome')</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.5; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
        h1 { color: #d63384; font-size: 22px; }
        h2 { color: #d63384; }
        a.button { display: inline-block; padding: 12px 24px; background: #d63384; color: #fff; text-decoration: none; border-radius: 6px; }
        .body { white-space: pre-line; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
        .amount { font-size: 18px; font-weight: 700; }
        .credentials { background: #fdf2f7; border: 1px solid #f5c6da; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
        .footer { margin-top: 24px; font-size: 12px; color: #777; }
    </style>
</head>
<body>
    <div class="container">
        @yield('content')
        <div class="footer">
            — Pawesome Retreat Inc.
        </div>
    </div>
</body>
</html>
