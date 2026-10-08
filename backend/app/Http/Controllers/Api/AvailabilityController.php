<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\BookingAvailabilityService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class AvailabilityController extends Controller
{
    /**
     * Get veterinary availability for a specific date
     */
    public function veterinary(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'date' => 'required|date|after_or_equal:today',
            'service_id' => 'nullable|integer|exists:services,id',
            'service_name' => 'nullable|string|max:150',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid request parameters',
                'errors' => $validator->errors()
            ], 422);
        }

        $date = $request->input('date');
        $serviceId = $request->input('service_id');
        $serviceName = $request->input('service_name');

        try {
            $availability = BookingAvailabilityService::getVeterinaryAvailability($date, $serviceId, $serviceName);
            return response()->json($availability);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to check veterinary availability: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get grooming availability for a specific date
     */
    public function grooming(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'date' => 'required|date|after_or_equal:today',
            'service_name' => 'nullable|string|max:150',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid request parameters',
                'errors' => $validator->errors()
            ], 422);
        }

        $date = $request->input('date');
        $serviceName = $request->input('service_name');

        try {
            $availability = BookingAvailabilityService::getGroomingAvailability($date, $serviceName);
            return response()->json($availability);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to check grooming availability: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get boarding availability for date range
     */
    public function boarding(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'check_in' => 'required|date|after_or_equal:today',
            'check_out' => 'required|date|after:check_in',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid request parameters',
                'errors' => $validator->errors()
            ], 422);
        }

        $checkIn = $request->input('check_in');
        $checkOut = $request->input('check_out');

        try {
            $availability = BookingAvailabilityService::getBoardingAvailability($checkIn, $checkOut);
            return response()->json($availability);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to check boarding availability: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Check specific veterinary slot availability
     */
    public function checkVeterinarySlot(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'date' => 'required|date|after_or_equal:today',
            'time' => 'required|date_format:H:i',
            'veterinarian_id' => 'nullable|integer|exists:users,id',
            'service_name' => 'nullable|string|max:150',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid request parameters',
                'errors' => $validator->errors()
            ], 422);
        }

        $date = $request->input('date');
        $time = $request->input('time');
        $veterinarianId = $request->input('veterinarian_id');

        try {
            $isAvailable = BookingAvailabilityService::isVeterinarySlotAvailable($date, $time, $veterinarianId, $request->input('service_name'));
            
            return response()->json([
                'success' => true,
                'available' => $isAvailable,
                'message' => $isAvailable 
                    ? 'Time slot is available' 
                    : 'This time slot is no longer available. Please choose another slot.',
                'date' => $date,
                'time' => $time,
                'veterinarian_id' => $veterinarianId,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to check slot availability: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Check specific grooming date availability
     */
    public function checkGroomingDate(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'date' => 'required|date|after_or_equal:today',
            'time' => 'nullable|date_format:H:i',
            'service_name' => 'nullable|string|max:150',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid request parameters',
                'errors' => $validator->errors()
            ], 422);
        }

        $date = $request->input('date');

        try {
            $isAvailable = $request->filled('time')
                ? BookingAvailabilityService::isServiceTimeAvailable('grooming', $date, $request->input('time'), $request->input('service_name'))
                : BookingAvailabilityService::isGroomingDateAvailable($date, $request->input('service_name'));
            
            return response()->json([
                'success' => true,
                'available' => $isAvailable,
                'message' => $isAvailable 
                    ? 'Grooming date is available' 
                    : 'This grooming date is already reserved. Please choose another date.',
                'date' => $date,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to check grooming availability: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Check specific boarding room availability
     */
    public function checkBoardingRoom(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'room_id' => 'required|integer|exists:hotel_rooms,id',
            'check_in' => 'required|date|after_or_equal:today',
            'check_out' => 'required|date|after:check_in',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid request parameters',
                'errors' => $validator->errors()
            ], 422);
        }

        $roomId = $request->input('room_id');
        $checkIn = $request->input('check_in');
        $checkOut = $request->input('check_out');

        try {
            $isAvailable = BookingAvailabilityService::isBoardingRoomAvailable($roomId, $checkIn, $checkOut);
            
            return response()->json([
                'success' => true,
                'available' => $isAvailable,
                'message' => $isAvailable 
                    ? 'Room is available for selected dates' 
                    : 'This room is already booked for the selected date range. Please choose another room or dates.',
                'room_id' => $roomId,
                'check_in' => $checkIn,
                'check_out' => $checkOut,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to check room availability: ' . $e->getMessage()
            ], 500);
        }
    }
}
