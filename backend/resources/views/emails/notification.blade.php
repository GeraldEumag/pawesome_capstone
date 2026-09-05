<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $title }}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.5; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
        h2 { color: #d63384; }
        .body { white-space: pre-line; }
        .footer { margin-top: 24px; font-size: 12px; color: #777; }
    </style>
</head>
<body>
    <div class="container">
        <h2>{{ $title }}</h2>
        <div class="body">{{ $body }}</div>
        <div class="footer">
            — Pawesome Retreat Inc.
        </div>
    </div>
</body>
</html>
