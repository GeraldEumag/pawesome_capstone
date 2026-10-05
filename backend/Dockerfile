# Pawesome Laravel API — deterministic Railway build
# Replaces the Railpack/mise PHP toolchain (vfox-php GitHub clone flakes).
# Build context = backend/ (Railway service rootDirectory=/backend).

# ---------- Stage 1: Vite assets (backend/package.json -> public/build) ----------
FROM node:20-bookworm-slim AS assets
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY vite.config.js ./
COPY resources ./resources
RUN npm run build

# ---------- Stage 2: PHP 8.2 runtime ----------
FROM php:8.2-cli-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        git unzip \
        libzip-dev libicu-dev libonig-dev libxml2-dev libcurl4-openssl-dev \
    && docker-php-ext-install \
        pdo_mysql mbstring bcmath intl zip curl opcache pcntl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Composer deps first (layer cache), discovery deferred until code is copied.
COPY composer.json composer.lock ./
RUN composer install --no-dev --prefer-dist --optimize-autoloader \
        --no-scripts --no-interaction

COPY . .
COPY --from=assets /app/public/build public/build

# Run composer post-autoload-dump now that artisan/app code exists, and
# create writable runtime dirs (storage/ is .dockerignore'd; /app/storage/app
# is a Railway volume mount at runtime). bootstrap/cache must exist BEFORE
# dump-autoload — package:discover fails without it.
ENV COMPOSER_ALLOW_SUPERUSER=1
RUN mkdir -p storage/framework/{sessions,views,cache,testing} \
               storage/logs bootstrap/cache \
    && composer dump-autoload --optimize \
    && chmod -R a+rw storage bootstrap/cache

EXPOSE 8080

# Same startup semantics as the previous deployment. Migrations are NOT run
# here — they run in the Railway pre-deploy step (php artisan migrate --force).
CMD ["sh", "-c", "php artisan config:cache && php artisan storage:link --force && php artisan serve --host=0.0.0.0 --port=${PORT:-8080}"]
