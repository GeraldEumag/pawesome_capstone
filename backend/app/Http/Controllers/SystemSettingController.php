<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use Illuminate\Http\Request;

class SystemSettingController extends Controller
{
    private const VALID_PRESETS = [
        'blush-pink',
        'peach',
        'sage-green',
        'lavender',
        'baby-blue',
        'butter-yellow',
        'rose-mauve',
        'mint',
        'dusty-lilac',
        'warm-tan',
        'pawesome-mix',
        'cotton-candy',
        'ocean-dusk',
        'grape-soda',
        'citrus-burst',
        'midnight-berry',
        'cherry-blossom',
        'candy-floss',
        'bubble-gum',
        'sugar-rush',
        'frosted-berry',
        'dreamsicle',
        'neon-twilight',
        'coral-reef',
        'emerald-mist',
        'golden-hour',
        'arctic-aurora',
    ];

    /**
     * Public endpoint — no auth required.
     * Returns the current system-wide theme color.
     */
    public function getPublicSettings()
    {
        return response()->json([
            'theme_color' => SystemSetting::get('theme_color', 'blush-pink'),
        ]);
    }

    /**
     * Admin-only — save the chosen theme color.
     */
    public function updateThemeColor(Request $request)
    {
        $request->validate([
            'theme_color' => ['required', 'string', 'in:' . implode(',', self::VALID_PRESETS)],
        ]);

        SystemSetting::set('theme_color', $request->theme_color);

        return response()->json([
            'message'     => 'Theme color updated successfully.',
            'theme_color' => $request->theme_color,
        ]);
    }
}
