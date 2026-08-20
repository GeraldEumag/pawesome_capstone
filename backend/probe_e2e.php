<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use App\Models\Payroll;
use App\Models\Attendance;

echo "=== USERS ===" . PHP_EOL;
$users = User::whereIn('role', ['manager', 'admin', 'cashier', 'receptionist', 'veterinary', 'inventory'])
    ->select('id', 'name', 'email', 'role', 'base_salary', 'is_active')
    ->get();
foreach ($users as $u) {
    echo "  {$u->id} | {$u->name} | {$u->email} | {$u->role} | salary={$u->base_salary} | active={$u->is_active}" . PHP_EOL;
}

echo PHP_EOL . "=== PAYROLLS (last 5) ===" . PHP_EOL;
$payrolls = Payroll::with('user')->orderBy('created_at', 'desc')->take(5)->get();
foreach ($payrolls as $p) {
    echo "  {$p->id} | {$p->payroll_id} | user={$p->user->name} | status={$p->status} | gross={$p->gross_pay} | net={$p->net_pay} | sss={$p->sss_contribution} | philhealth={$p->philhealth_contribution} | pagibig={$p->pagibig_contribution} | tax={$p->tax_deduction}" . PHP_EOL;
}

echo PHP_EOL . "=== ATTENDANCE (last 5) ===" . PHP_EOL;
$att = Attendance::with('user')->orderBy('date', 'desc')->take(5)->get();
foreach ($att as $a) {
    echo "  {$a->id} | user={$a->user->name} | date={$a->date} | status={$a->status} | hours={$a->total_hours} | ot={$a->overtime_hours}" . PHP_EOL;
}
