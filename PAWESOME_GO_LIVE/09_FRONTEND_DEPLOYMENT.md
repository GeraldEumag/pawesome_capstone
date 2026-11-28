# 09 — Frontend Deployment

## Status: BLOCKED — awaiting Vercel project + API domain

## Pre-deploy checklist (prepared)

- [x] Build reproducible — `npm run build` → `build/` verified green
- [x] No secrets in frontend env surface (`VITE_*` only)
- [x] API client reads `VITE_API_BASE_URL` at build time
- [ ] Vercel project created, root `frontend/`
- [ ] `VITE_API_BASE_URL=https://<api-domain>/api` set **before build**
- [ ] Production branch decided (release branch vs `main` merge)
- [ ] Domain + DNS

## Post-deploy verification checklist (prepared)

- [ ] Landing page loads over HTTPS
- [ ] Login page renders; staff + customer login work
- [ ] Registration flow reaches API (correct origin, no CORS errors)
- [ ] Customer portal loads pet/booking data
- [ ] Staff dashboards load (admin, receptionist, cashier, vet, inventory, manager)
- [ ] Browser console: zero errors
- [ ] Images/logos load (absolute URLs, no localhost)
- [ ] Protected routes redirect unauthenticated users
- [ ] Responsive layout spot-check (mobile viewport)

**No deployment performed — no Vercel project/domain exists.**
