<?php
// Fix script for vaccination card upload

$file = 'c:/xampp/htdocs/pawesome-new/backend/app/Http/Controllers/BoardingController.php';
$content = file_get_contents($file);

// Find all occurrences of $vaccinationPath = null; and add file handling
$search = '$vaccinationPath = null;';
$replace = '$vaccinationPath = null;' . "\n" . '        if ($request->hasFile(\'vaccination_card\')) {' . "\n" . '            $vaccinationPath = $request->file(\'vaccination_card\')->store(\'vaccination-cards\', \'private\');' . "\n" . '        }';

// Check if already fixed
if (strpos($content, "hasFile('vaccination_card')") !== false) {
    echo "Fix already applied!\n";
    exit(0);
}

$newContent = str_replace($search, $replace, $content);
if ($newContent !== $content) {
    file_put_contents($file, $newContent);
    echo "SUCCESS: Vaccination card upload fix applied!\n";
} else {
    echo "ERROR: Could not find \$vaccinationPath = null; in file\n";
}
