<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LandingPageContent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class LandingPageContentController extends Controller
{
    protected array $allowedSections = [
        'hero',
        'featured_services',
        'how_it_works',
        'about',
        'final_cta',
        'trust_stats',
        'facilities_gallery',
        'footer',
        'auth_pages',
    ];

    public function showPublic(): JsonResponse
    {
        $contents = Cache::remember('landing_page_contents', 300, function () {
            return LandingPageContent::active()
                ->get()
                ->keyBy('section_key')
                ->map(fn ($item) => $item->content_data)
                ->toArray();
        });

        return response()->json([
            'success' => true,
            'data' => $contents,
        ]);
    }

    public function index(): JsonResponse
    {
        $contents = LandingPageContent::all()
            ->map(fn ($item) => [
                'section_key' => $item->section_key,
                'content_type' => $item->content_type,
                'content_data' => $item->content_data,
                'is_active' => $item->is_active,
                'updated_at' => $item->updated_at,
            ]);

        return response()->json([
            'success' => true,
            'data' => $contents,
        ]);
    }

    public function show(string $section): JsonResponse
    {
        if (!in_array($section, $this->allowedSections, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid section key.',
            ], 422);
        }

        $content = LandingPageContent::where('section_key', $section)->first();

        if (!$content) {
            return response()->json([
                'success' => false,
                'message' => 'Section not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'section_key' => $content->section_key,
                'content_type' => $content->content_type,
                'content_data' => $content->content_data,
                'is_active' => $content->is_active,
                'updated_at' => $content->updated_at,
            ],
        ]);
    }

    public function update(Request $request, string $section): JsonResponse
    {
        if (!in_array($section, $this->allowedSections, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid section key.',
            ], 422);
        }

        $validated = Validator::make($request->all(), [
            'content_data' => 'required|array',
            'is_active' => 'sometimes|boolean',
        ]);

        if ($validated->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validated->errors(),
            ], 422);
        }

        $content = LandingPageContent::where('section_key', $section)->first();

        if (!$content) {
            return response()->json([
                'success' => false,
                'message' => 'Section not found.',
            ], 404);
        }

        $content->content_data = $request->input('content_data');

        if ($request->has('is_active')) {
            $content->is_active = $request->boolean('is_active');
        }

        $content->updated_by = $request->user()?->id;
        $content->save();

        Cache::forget('landing_page_contents');

        return response()->json([
            'success' => true,
            'message' => 'Section updated successfully.',
            'data' => $content->content_data,
        ]);
    }

    public function uploadImage(Request $request): JsonResponse
    {
        $validated = Validator::make($request->all(), [
            'image' => 'required|image|mimes:jpeg,png,jpg,webp|max:2048',
            'section' => ['required', 'string', Rule::in($this->allowedSections)],
        ]);

        if ($validated->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validated->errors(),
            ], 422);
        }

        $file = $request->file('image');
        $path = $file->store('landing-page', 'public');
        $url = Storage::url($path);

        return response()->json([
            'success' => true,
            'message' => 'Image uploaded successfully.',
            'data' => [
                'url' => $url,
                'path' => $path,
            ],
        ]);
    }
}
