<?php
$file = 'c:/xampp/htdocs/pawesome-new/backend/app/Http/Controllers/BoardingController.php';
$content = file_get_contents($file);

// Try different newline combinations
$search1 = '$vaccinationPath = null;' . "\n" . '        ' . "\n" . '        // Calculate total amount with add-ons';
$search2 = '$vaccinationPath = null;' . "\r\n" . '        ' . "\r\n" . '        // Calculate total amount with add-ons';

$replace = '$vaccinationPath = null;' . "\n" . '        if ($request->hasFile(\'vaccination_card\')) {' . "\n" . '            $vaccinationPath = $request->file(\'vaccination_card\')->store(\'vaccination-cards\', \'private\');' . "\n" . '        }' . "\n" . '        ' . "\n" . '        // Calculate total amount with add-ons';

$newContent = str_replace($search1, $replace, $content);
if ($newContent === $content) {
    $newContent = str_replace($search2, $replace, $content);
}

if ($newContent !== $content) {
    file_put_contents($file, $newContent);
    echo "SUCCESS: File updated\n";
} else {
    echo "ERROR: Pattern not found.\n";
    // Debug: search for vaccinationPath in entire file
    $lines = file($file);
    $found = false;
    for ($i = 0; $i < count($lines); $i++) {
        if (strpos($lines[$i], 'vaccinationPath') !== false) {
            echo "Line " . ($i + 1) . ": " . $lines[$i];
            $found = true;
        }
    }
    if (!$found) {
        echo "vaccinationPath not found in file\n";
    }
}
