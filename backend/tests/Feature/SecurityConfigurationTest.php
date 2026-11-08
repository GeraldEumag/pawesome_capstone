<?php

namespace Tests\Feature;

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class SecurityConfigurationTest extends TestCase
{
    public function test_laravel_security_and_proxy_middleware_are_in_the_global_stack(): void
    {
        $kernel = $this->app->make(Kernel::class);
        $property = new \ReflectionProperty($kernel, 'middleware');
        $global = $property->getValue($kernel);

        $this->assertContains(\Illuminate\Http\Middleware\TrustProxies::class, $global);
        $this->assertContains(\App\Http\Middleware\Cors::class, $global);
        $this->assertContains(\App\Http\Middleware\SecurityHeaders::class, $global);
        $this->assertContains(\Illuminate\Http\Middleware\ValidatePostSize::class, $global);
        $this->assertContains(\Illuminate\Foundation\Http\Middleware\TrimStrings::class, $global);
        $this->assertContains(\Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull::class, $global);
        $this->assertNotContains(\Illuminate\Http\Middleware\HandleCors::class, $global);
    }

    public function test_trusted_proxy_headers_control_request_scheme_and_client_ip(): void
    {
        Route::middleware('api')->get('/audit-request-context', function (Request $request) {
            return response()->json([
                'secure' => $request->secure(),
                'ip' => $request->ip(),
                'host' => $request->getHost(),
            ]);
        });

        $this->withServerVariables(['REMOTE_ADDR' => '10.20.30.40'])
            ->get('/audit-request-context', [
                'X-Forwarded-Proto' => 'https',
                'X-Forwarded-For' => '203.0.113.10',
                'X-Forwarded-Host' => 'api.example.test',
            ])
            ->assertOk()
            ->assertJsonPath('secure', true)
            ->assertJsonPath('ip', '203.0.113.10')
            ->assertJsonPath('host', 'api.example.test');
    }
}
