# 02 — Infrastructure Provisioning Checklist

**Status key:** ✅ COMPLETE · ⏳ PENDING USER ACTION · 🚫 BLOCKED · ➖ N/A

I have no Vercel/Railway/DNS/Brevo account access — every provisioning
item below requires **your action**. Nothing here is claimed complete.

## Vercel (frontend)

| # | Item | Status | Exact action |
| --- | --- | --- | --- |
| V-1 | Create/import project from Git repo | ⏳ | vercel.com → Add New → Project → import `Pawesome_Capstone` repo |
| V-2 | Root directory = `frontend/` | ⏳ | Project Settings → Root Directory → `frontend` |
| V-3 | Framework preset | ⏳ | Vite auto-detected; Build Command `npm run build`; Output `build` (verify — Vite default is `dist`, ours is `build`) |
| V-4 | Production branch | ⏳ | Set to the release branch (or merge to `main` first — decide) |
| V-5 | Env var `VITE_API_BASE_URL` | ⏳ | Set **before** first production build: `https://<api-domain>/api` |
| V-6 | Domain | ⏳ | Add domain in project; point DNS per Vercel instructions |

## Railway (backend + DB)

| # | Item | Status | Exact action |
| --- | --- | --- | --- |
| R-1 | Create project + GitHub repo connection | ⏳ | railway.app → New Project → Deploy from GitHub → select repo |
| R-2 | Backend service root = `backend/` | ⏳ | Service Settings → Root Directory → `/backend` (Dockerfile auto-detected) |
| R-3 | MySQL service | ⏳ | New → Database → MySQL; note internal host/creds |
| R-4 | Persistent volume | ⏳ | Backend service → Volumes → mount at `/app/storage/app` (path per Dockerfile WORKDIR) |
| R-5 | Backend env vars | ⏳ | Set all vars per report 03 (secrets in Railway Variables, never committed) |
| R-6 | Queue worker service (if `database` queue) | ⏳ | New service from same repo → start cmd `php artisan queue:work --queue=emails,receipts,default --sleep=3` → same env vars |
| R-7 | Public domain for API | ⏳ | Service → Settings → Networking → Generate Domain → `*.up.railway.app` or custom |

## Domain & HTTPS

| # | Item | Status | Exact action |
| --- | --- | --- | --- |
| D-1 | Choose domain | ⏳ | e.g. `pawesome.<tld>` + `api.pawesome.<tld>` |
| D-2 | DNS records | ⏳ | Use the **exact records each platform shows** (Vercel A/CNAME; Railway CNAME) — do not invent values |
| D-3 | TLS | ⏳ | Auto on both platforms once DNS resolves; verify padlock |

## Decision needed from you

1. **Accounts:** Do Vercel + Railway accounts/projects already exist,
   or create new?
2. **Domain:** owned already, or to be purchased?
3. **Queue mode:** `database`+worker (recommended prod) vs `sync`
   (demo)?
4. **Release branch:** deploy `audit/pawesome-final-acceptance` directly,
   or merge to `main` first?
5. **Brevo:** account + API key + verified sender ready?

**Once you confirm provisioning is done (or grant access), I proceed
to Phase 4+ verification. Until then Phases 8–11 remain BLOCKED.**
