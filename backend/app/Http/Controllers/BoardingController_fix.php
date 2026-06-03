<?php
// Temporary file to verify the fix location
// The fix needs to be inserted after line 363 in BoardingController.php

// Current code (line 362-364):
$vaccinationPath = null;

// Calculate total amount with add-ons

// Fixed code should be:
$vaccinationPath = null;
if ($request->hasFile('vaccination_card')) {
    $vaccinationPath = $request->file('vaccination_card')->store('vaccination-cards', 'private');
}

// Calculate total amount with add-ons
