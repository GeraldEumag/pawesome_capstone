<?php

namespace App\Services\Receipts;

/**
 * Best-effort image normalization for readers: fixes EXIF rotation and caps
 * width when GD is available; otherwise returns the original untouched.
 * PDFs always pass through. Never throws — preprocessing is an optimization,
 * not a requirement.
 */
class ReceiptImagePreprocessor
{
    private const MAX_WIDTH = 1600;

    /**
     * @return string path of the working image to hand to the reader
     */
    public static function prepare(string $absolutePath, string $mime): string
    {
        if ($mime === 'application/pdf' || !extension_loaded('gd')) {
            return $absolutePath;
        }

        try {
            $info = @getimagesize($absolutePath);
            if (!$info) {
                return $absolutePath;
            }

            [$width, $height] = $info;
            $image = match ($info['mime'] ?? '') {
                'image/jpeg' => @imagecreatefromjpeg($absolutePath),
                'image/png' => @imagecreatefrompng($absolutePath),
                'image/webp' => @imagecreatefromwebp($absolutePath),
                default => null,
            };
            if (!$image) {
                return $absolutePath;
            }

            // Fix orientation from EXIF for JPEGs.
            if (($info['mime'] ?? '') === 'image/jpeg' && function_exists('exif_read_data')) {
                $exif = @exif_read_data($absolutePath);
                $image = match ((int) ($exif['Orientation'] ?? 1)) {
                    3 => imagerotate($image, 180, 0),
                    6 => imagerotate($image, -90, 0),
                    8 => imagerotate($image, 90, 0),
                    default => $image,
                };
            }

            if ($width > self::MAX_WIDTH) {
                $newHeight = (int) round($height * (self::MAX_WIDTH / $width));
                $resized = imagecreatetruecolor(self::MAX_WIDTH, $newHeight);
                imagecopyresampled($resized, $image, 0, 0, 0, 0, self::MAX_WIDTH, $newHeight, $width, $height);
                imagedestroy($image);
                $image = $resized;
            }

            $working = $absolutePath . '.work.' . (str_contains($info['mime'] ?? '', 'png') ? 'png' : 'jpg');
            $saved = str_ends_with($working, '.png')
                ? imagepng($image, $working)
                : imagejpeg($image, $working, 90);
            imagedestroy($image);

            return $saved ? $working : $absolutePath;
        } catch (\Throwable) {
            return $absolutePath;
        }
    }

    /**
     * dHash perceptual hash (64-bit hex) — needs GD; null otherwise so the
     * similar-image validation degrades to a pass-with-note.
     */
    public static function dHash(string $absolutePath, string $mime): ?string
    {
        if ($mime === 'application/pdf' || !extension_loaded('gd')) {
            return null;
        }

        try {
            $info = @getimagesize($absolutePath);
            $image = match ($info['mime'] ?? '') {
                'image/jpeg' => @imagecreatefromjpeg($absolutePath),
                'image/png' => @imagecreatefrompng($absolutePath),
                'image/webp' => @imagecreatefromwebp($absolutePath),
                default => null,
            };
            if (!$image) {
                return null;
            }

            $thumb = imagecreatetruecolor(9, 8);
            imagecopyresampled($thumb, $image, 0, 0, 0, 0, 9, 8, $info[0], $info[1]);
            imagedestroy($image);

            $bits = '';
            for ($y = 0; $y < 8; $y++) {
                for ($x = 0; $x < 8; $x++) {
                    $left = imagecolorsforindex($thumb, imagecolorat($thumb, $x, $y))['red'] ?? 0;
                    $right = imagecolorsforindex($thumb, imagecolorat($thumb, $x + 1, $y))['red'] ?? 0;
                    $bits .= $left > $right ? '1' : '0';
                }
            }
            imagedestroy($thumb);

            $hex = '';
            foreach (str_split($bits, 4) as $nibble) {
                $hex .= dechex(bindec($nibble));
            }

            return str_pad($hex, 16, '0', STR_PAD_LEFT);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Hamming distance between two 16-hex-digit dHash values.
     */
    public static function hammingDistance(string $a, string $b): int
    {
        $distance = 0;
        $length = min(strlen($a), strlen($b));
        for ($i = 0; $i < $length; $i++) {
            $x = hexdec($a[$i]) ^ hexdec($b[$i]);
            $distance += substr_count(decbin($x), '1');
        }

        return $distance;
    }

    public static function cleanup(?string $workingPath, string $originalPath): void
    {
        if ($workingPath && $workingPath !== $originalPath && is_file($workingPath)) {
            @unlink($workingPath);
        }
    }
}
