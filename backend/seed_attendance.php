<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Attendance;
use App\Models\User;

// Create attendance for cashier (user 4) for June 1-15, 2025
$userId = 4;
$baseDate = new \DateTime('2025-06-02');

$records = [
    ['date' => '2025-06-02', 'check_in' => '08:00', 'check_out' => '17:00', 'total_hours' => 8, 'ot' => 2, 'status' => 'present', 'late' => false],
    ['date' => '2025-06-03', 'check_in' => '08:00', 'check_out' => '17:00', 'total_hours' => 8, 'ot' => 0, 'status' => 'present', 'late' => false],
    ['date' => '2025-06-04', 'check_in' => '09:15', 'check_out' => '17:00', 'total_hours' => 7.75, 'ot' => 0, 'status' => 'late', 'late' => true],
    ['date' => '2025-06-05', 'check_in' => '08:00', 'check_out' => '17:00', 'total_hours' => 8, 'ot' => 1, 'status' => 'present', 'late' => false],
    ['date' => '2025-06-06', 'check_in' => '08:00', 'check_out' => '17:00', 'total_hours' => 8, 'ot' => 0, 'status' => 'present', 'late' => false],
];

foreach ($records as $r) {
    Attendance::create([
        'user_id' => $userId,
        'date' => $r['date'],
        'check_in' => $r['check_in'],
        'check_out' => $r['check_out'],
        'total_hours' => $r['total_hours'],
        'overtime_hours' => $r['ot'],
        'status' => $r['status'],
        'is_late' => $r['late'],
    ]);
    echo "Created attendance for {$r['date']}" . PHP_EOL;
}

echo PHP_EOL . "Done. Total attendance records for user {$userId}: " . Attendance::where('user_id', $userId)->count() . PHP_EOL;
