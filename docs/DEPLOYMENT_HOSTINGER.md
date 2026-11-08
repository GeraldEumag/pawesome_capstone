# Pawesome → Hostinger Shared + Vercel — Deployment Runbook

**Baseline:** `main` @ `dcf28f6` · **Target:** Hostinger Unlimited shared (PHP 8.3, MariaDB 10.5, LiteSpeed, SSH, cron) + Vercel frontend. Audits: `docs/audit/HOSTINGER_DEPLOYMENT_AUDIT.md`, `MARIADB_105_REHEARSAL.md`, `EMAIL_DELIVERY_AUDIT.md`, `PRODUCTION_READINESS_CHECKLIST.md`.

## Pre-flight (before touching the account)
- [ ] `git status` clean / commit approved
- [ ] Local MariaDB evidence reviewed (10.4.32 proven; 10.5 = low residual risk)
- [ ] New Brevo account: API key + **verified sender** (Senders page; single-sender OK without domain)
- [ ] hPanel: MySQL DB + user created; SSL enabled; note DB creds
- [ ] Vercel project URL known

## Deploy steps (SSH)
```bash
ssh <user>@mediumturquoise-mandrill-466666.hostingersite.com
php -v && composer --version && php -m | grep -iE "pdo_mysql|mbstring|intl|gd|openssl|dom|fileinfo|bcmath|curl"
git clone https://github.com/GeraldEumag/pawesome_capstone.git ~/pawesome
cd ~/pawesome/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env && php artisan key:generate   # FIRST deploy only — never re-run on existing data
nano .env   # see env block below
php artisan storage:link
chmod -R 775 storage bootstrap/cache
php artisan migrate --force                        # approved only — never --seed, never migrate:fresh
php artisan db:seed --class=BoardingRoomSeeder     # + approved reference seeders ONLY (see audit §3)
php artisan config:cache && php artisan route:cache && php artisan view:cache
```

### .env (placeholders)
```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://<hostinger-site>
FRONTEND_URL=https://<vercel-app>.vercel.app
DB_CONNECTION=mysql
DB_HOST=localhost
DB_DATABASE=<u…_pawesome>
DB_USERNAME=<u…_pawuser>
DB_PASSWORD=<pass>
QUEUE_CONNECTION=sync
SESSION_SECURE_COOKIE=true
MAIL_MAILER=brevo
BREVO_API_KEY=<new-key>
MAIL_FROM_ADDRESS=<verified-sender>
MAIL_FROM_NAME=Pawesome
PRIVATE_STORAGE_ROOT=private
PUBLIC_STORAGE_ROOT=public
```

### Docroot
Point domain docroot to `~/pawesome/backend/public` in hPanel. If fixed `public_html`: symlink `public_html → backend/public` or move `public/` contents in and patch `index.php` paths. Verify `curl https://<site>/.env` → 404/403 and `/storage/logs` unreachable.

### Cron
`* * * * * php /home/<user>/pawesome/backend/artisan schedule:run >> /dev/null 2>&1` — verify via `php artisan schedule:list` once.

### Vercel
Set `VITE_API_BASE_URL=https://<hostinger-site>/api` → redeploy. (Exact var name verified in frontend code.)

## Smoke tests
`curl https://<site>/api/health` → 200 · register customer → check outbox `sent` + mailbox (+spam) · login · booking → receptionist approve → cashier verify → receipt · `curl https://<site>/.env` → 404/403 · inactive-account token → 403.

## Rollback
Code: `git checkout <prior-commit>` + `config:cache`. DB: restore from pre-deploy dump (`mysqldump -u<user> -p <db> > backup-$(date +%F).sql` BEFORE migrate). Post-backup transactions are lost on restore — record recovery point.

## Limitations
Sync queue = slower email-bound requests · no workers/WebSockets · plan expires Nov 5 · no DKIM on hostingersite.com (spam risk) · MariaDB 10.5 exact-version unverified (10.4 proven).
