<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BoardingCareLog;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\HeaderUtils;

class SecureFileController extends Controller
{
    /**
     * Securely view payment proof files
     */
    public function viewPaymentProof(Request $request, $type, $id)
    {
        $user = Auth::user();
        
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $record = null;

        // Determine record type and fetch data
        switch ($type) {
            case 'service-request':
                $record = DB::table('service_requests')->where('id', $id)->first();
                break;

            case 'customer-order':
                $record = DB::table('customer_orders')->where('id', $id)->first();
                break;

            case 'boarding':
            case 'boarding-vaccination':
                $record = DB::table('boardings')->where('id', $id)->first();
                break;

            case 'medical_confinement':
            case 'medical-confinement':
                $record = DB::table('medical_confinements')->where('id', $id)->first();
                break;

            default:
                return response()->json(['message' => 'Invalid file type'], 400);
        }

        if (!$record) {
            return response()->json(['message' => 'Record not found'], 404);
        }

        // Check authorization
        $canAccess = false;
        
        if ($user->role === 'customer') {
            $canAccess = $this->recordBelongsToCustomer($record, $user);
        } elseif (in_array($user->role, ['admin', 'super_admin', 'cashier', 'super_receptionist'], true)) {
            // Admin and cashier can access all payment proofs
            $canAccess = true;
        } elseif (in_array($user->role, ['receptionist', 'manager'])) {
            // Receptionist and manager can view for business purposes
            $canAccess = true;
        }

        if (!$canAccess) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        // Check if payment proof exists
        if (!$record->payment_proof) {
            return response()->json(['message' => 'Payment proof not found'], 404);
        }

        // Determine file path and handle legacy files
        $filePath = $record->payment_proof;
        $disk = 'private';
        
        // Handle legacy public storage files
        if (str_starts_with($filePath, 'payment_proofs/') || str_starts_with($filePath, 'payment-proofs/')) {
            if (Storage::disk('public')->exists($filePath)) {
                $disk = 'public';
            } elseif (Storage::disk('private')->exists($filePath)) {
                $disk = 'private';
            } else {
                return response()->json(['message' => 'File not found'], 404);
            }
        } else {
            // New private storage format
            if (!Storage::disk('private')->exists($filePath)) {
                return response()->json(['message' => 'File not found'], 404);
            }
        }

        // Get file information
        $fileContents = Storage::disk($disk)->get($filePath);
        
        // Determine MIME type based on file extension
        $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mimeTypes = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            'pdf' => 'application/pdf'
        ];
        
        $mimeType = $mimeTypes[$extension] ?? 'application/octet-stream';
        
        if (!$fileContents) {
            return response()->json(['message' => 'File not readable'], 404);
        }

        // Validate file type for security
        $allowedMimeTypes = [
            'image/jpeg',
            'image/png', 
            'image/webp',
            'application/pdf'
        ];
        
        if (!in_array($mimeType, $allowedMimeTypes)) {
            return response()->json(['message' => 'Invalid file type'], 422);
        }

        // Return file response
        return response($fileContents)
            ->header('Content-Type', $mimeType)
            ->header('Content-Disposition', $this->inlineDisposition('payment_proof_' . $id . '.' . $extension))
            ->header('Cache-Control', 'private, max-age=3600') // Cache for 1 hour
            ->header('X-Content-Type-Options', 'nosniff'); // Prevent MIME type sniffing
    }

    /**
     * Securely view vaccination card files
     */
    public function viewVaccinationCard(Request $request, $id)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $record = DB::table('boardings')->where('id', $id)->first();

        if (!$record) {
            return response()->json(['message' => 'Record not found'], 404);
        }

        // Authorization
        $isOwner = false;
        if ($user->role === 'customer') {
            $isOwner = ($record->customer_id == $user->id);
        }

        $canAccess = false;
        if ($user->role === 'customer') {
            $canAccess = $isOwner;
        } elseif (in_array($user->role, ['admin', 'super_admin', 'receptionist', 'super_receptionist', 'manager', 'cashier', 'veterinary'])) {
            $canAccess = true;
        }

        if (!$canAccess) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $filePath = $record->vaccination_card ?? null;

        if (!$filePath) {
            return response()->json(['message' => 'Vaccination card not found'], 404);
        }

        // Determine file path and handle legacy files
        $disk = 'private';

        // Handle legacy public storage files
        if (str_starts_with($filePath, 'vaccination_cards/') || str_starts_with($filePath, 'vaccination-cards/')) {
            if (Storage::disk('public')->exists($filePath)) {
                $disk = 'public';
            } elseif (Storage::disk('private')->exists($filePath)) {
                $disk = 'private';
            } else {
                return response()->json(['message' => 'File not found'], 404);
            }
        } else {
            // New private storage format
            if (!Storage::disk('private')->exists($filePath)) {
                return response()->json(['message' => 'File not found'], 404);
            }
        }

        $fileContents = Storage::disk($disk)->get($filePath);

        $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mimeTypes = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'pdf' => 'application/pdf',
        ];

        $mimeType = $mimeTypes[$extension] ?? 'application/octet-stream';

        if (!$fileContents) {
            return response()->json(['message' => 'File not readable'], 404);
        }

        $allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];

        if (!in_array($mimeType, $allowedMimeTypes)) {
            return response()->json(['message' => 'Invalid file type'], 422);
        }

        return response($fileContents)
            ->header('Content-Type', $mimeType)
            ->header('Content-Disposition', $this->inlineDisposition('vaccination_card_' . $id . '.' . $extension))
            ->header('Cache-Control', 'private, max-age=3600')
            ->header('X-Content-Type-Options', 'nosniff');
    }

    /**
     * View profile photos — publicly accessible (avatars are not sensitive)
     */
    public function viewProfilePhoto(Request $request, $userId)
    {
        $targetUser = DB::table('users')->where('id', $userId)->first();
        
        if (!$targetUser) {
            return response()->json(['message' => 'User not found'], 404);
        }

        if (!$targetUser->profile_photo) {
            return response()->json(['message' => 'Profile photo not found'], 404);
        }

        // Use raw DB value (not the model accessor which returns the API URL)
        $filePath = $targetUser->profile_photo;
        // Strip /api/ prefix if someone stored the URL instead of path
        if (str_starts_with($filePath, '/api/')) {
            return response()->json(['message' => 'Profile photo not found'], 404);
        }
        $disk = 'public';
        
        if (!Storage::disk($disk)->exists($filePath)) {
            return response()->json(['message' => 'File not found'], 404);
        }

        $fileContents = Storage::disk($disk)->get($filePath);
        
        // Determine MIME type based on file extension
        $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mimeTypes = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp'
        ];
        
        $mimeType = $mimeTypes[$extension] ?? 'image/jpeg';
        
        if (!$fileContents) {
            return response()->json(['message' => 'File not readable'], 404);
        }

        // Profile photos should be images only
        $allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        
        if (!in_array($mimeType, $allowedMimeTypes)) {
            return response()->json(['message' => 'Invalid file type'], 422);
        }

        return response($fileContents)
            ->header('Content-Type', $mimeType)
            ->header('Content-Disposition', $this->inlineDisposition('profile_' . $userId . '.' . $extension))
            ->header('Cache-Control', 'public, max-age=86400') // Cache for 1 day
            ->header('X-Content-Type-Options', 'nosniff');
    }

    /**
     * Securely view pet photos
     */
    public function viewPetImage(Request $request, $petId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $pet = DB::table('pets')->where('id', $petId)->first();

        if (!$pet) {
            return response()->json(['message' => 'Pet not found'], 404);
        }

        // Authorization: customer can view their own pet; staff can view any
        $canAccess = false;
        if ($user->role === 'customer') {
            $customer = DB::table('customers')
                ->where('user_id', $user->id)
                ->orWhere('email', $user->email)
                ->first();
            $canAccess = $customer && (int) $pet->customer_id === (int) $customer->id;
        } else {
            $canAccess = in_array($user->role, ['admin', 'receptionist', 'cashier', 'manager', 'veterinary', 'inventory']);
        }

        if (!$canAccess) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        if (!$pet->image) {
            return response()->json(['message' => 'Pet photo not found'], 404);
        }

        $filePath = $pet->image;
        $disk = 'private';

        if (!Storage::disk($disk)->exists($filePath)) {
            $disk = 'public';
            if (!Storage::disk($disk)->exists($filePath)) {
                return response()->json(['message' => 'File not found'], 404);
            }
        }

        $fileContents = Storage::disk($disk)->get($filePath);

        $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mimeTypes = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
        ];

        $mimeType = $mimeTypes[$extension] ?? 'image/jpeg';

        if (!$fileContents) {
            return response()->json(['message' => 'File not readable'], 404);
        }

        $allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (!in_array($mimeType, $allowedMimeTypes)) {
            return response()->json(['message' => 'Invalid file type'], 422);
        }

        return response($fileContents)
            ->header('Content-Type', $mimeType)
            ->header('Content-Disposition', $this->inlineDisposition('pet_' . $petId . '.' . $extension))
            ->header('Cache-Control', 'private, max-age=3600')
            ->header('X-Content-Type-Options', 'nosniff');
    }

    /**
     * Securely view care-log photos (boarding and medical confinement).
     *
     * Access: the owning customer, plus staff roles that work with care
     * records (receptionist, veterinary, manager, admin). Cashier and
     * inventory have no care-record workflow and are denied.
     */
    public function viewCareLogPhoto(Request $request, $id)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $log = BoardingCareLog::with(['boarding', 'confinement'])->find($id);

        if (!$log) {
            return response()->json(['message' => 'Care log not found'], 404);
        }

        $record = $log->boarding ?? $log->confinement;

        if ($user->role === 'customer') {
            $canAccess = $record !== null && $this->recordBelongsToCustomer($record, $user);
        } else {
            $canAccess = in_array($user->role, [
                'admin', 'super_admin', 'manager',
                'receptionist', 'super_receptionist', 'veterinary',
            ], true);
        }

        if (!$canAccess) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $filePath = $log->photo_path;

        if (!$filePath) {
            return response()->json(['message' => 'Care log photo not found'], 404);
        }

        // New uploads live on the private disk; fall back to the public disk
        // for historical files that predate the private-storage policy.
        $disk = Storage::disk('private')->exists($filePath) ? 'private' : 'public';

        if (!Storage::disk($disk)->exists($filePath)) {
            return response()->json(['message' => 'File not found'], 404);
        }

        $fileContents = Storage::disk($disk)->get($filePath);

        $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mimeTypes = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
        ];

        $mimeType = $mimeTypes[$extension] ?? 'application/octet-stream';

        if (!$fileContents || $mimeType === 'application/octet-stream') {
            return response()->json(['message' => 'File not readable'], 404);
        }

        return response($fileContents)
            ->header('Content-Type', $mimeType)
            ->header('Content-Disposition', $this->inlineDisposition('care_log_' . $id . '.' . $extension))
            ->header('Cache-Control', 'private, max-age=3600')
            ->header('X-Content-Type-Options', 'nosniff');
    }

    private function inlineDisposition(string $filename): string
    {
        $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', $filename);

        return HeaderUtils::makeDisposition(HeaderUtils::DISPOSITION_INLINE, $safe, $safe);
    }

    /**
     * customer_id is stored inconsistently across tables: customer_orders use the
     * users.id while boardings/medical_confinements use customers.id. Resolve all
     * three identifiers so ownership checks work for every record source.
     */
    private function recordBelongsToCustomer($record, $user): bool
    {
        if (($record->customer_email ?? null) === $user->email) {
            return true;
        }

        if ((int) ($record->customer_id ?? 0) === (int) $user->id) {
            return true;
        }

        $customerId = Customer::where('user_id', $user->id)
            ->orWhere('email', $user->email)
            ->value('id');

        return $customerId !== null && (int) $record->customer_id === (int) $customerId;
    }
}
