<?php

namespace App\Support;

use App\Models\SystemSetting;
use Illuminate\Validation\Rules\Password;

/**
 * Centralized password policy (F-04). Every password-setting endpoint
 * validates against the admin-configured security_* settings so the
 * advertised policy is actually enforced — never weaker than the
 * configured minimums.
 */
class PasswordPolicy
{
    private const DEFAULT_MIN_LENGTH = 8;
    private const MIN_ALLOWED = 6;
    private const MAX_ALLOWED = 32;

    /**
     * $floor is the endpoint's previous hardcoded minimum (8 for
     * register/change/reset, 6 for admin creation). The configured value
     * can only strengthen validation — never drop below the floor.
     */
    public static function rules(int $floor = self::DEFAULT_MIN_LENGTH): Password
    {
        $minLength = (int) SystemSetting::get('security_min_password_length', self::DEFAULT_MIN_LENGTH);
        if ($minLength < self::MIN_ALLOWED || $minLength > self::MAX_ALLOWED) {
            $minLength = self::DEFAULT_MIN_LENGTH;
        }
        $minLength = max($minLength, $floor);

        $rule = Password::min($minLength);

        if (self::flag('security_require_uppercase', true)) {
            $rule->mixedCase();
        }
        if (self::flag('security_require_numbers', true)) {
            $rule->numbers();
        }
        if (self::flag('security_require_special_chars', true)) {
            $rule->symbols();
        }

        return $rule;
    }

    private static function flag(string $key, bool $default): bool
    {
        $value = SystemSetting::get($key, $default);
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }
}
