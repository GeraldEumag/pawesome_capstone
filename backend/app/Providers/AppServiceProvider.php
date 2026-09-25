<?php

namespace App\Providers;

use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Behind TLS-terminating proxies (Railway/Render), url()/asset() must
        // emit https:// or browsers block generated links as mixed content.
        URL::forceHttps($this->app->isProduction());
    }
}
