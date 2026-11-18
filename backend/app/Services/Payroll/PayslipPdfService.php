<?php

namespace App\Services\Payroll;

use Dompdf\Dompdf;
use Dompdf\Options;

class PayslipPdfService
{
    public function render(array $payslip): string
    {
        $options = new Options;
        $options->set('defaultFont', 'DejaVu Sans');
        $options->set('isRemoteEnabled', false);

        $pdf = new Dompdf($options);
        $pdf->loadHtml(view('pdf.payslip', ['payslip' => $payslip])->render(), 'UTF-8');
        $pdf->setPaper('A4');
        $pdf->render();

        return $pdf->output();
    }
}
