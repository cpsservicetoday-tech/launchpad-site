# Launchpad Services — Website + AI System

A complete, deployable, SEO-loaded HVAC website with a built-in AI assistant.

## What's here
- `*.html` — 13 finished pages (home, 8 services, services index, Comfort Club, about, contact)
- `assets/styles.css` — all design (edit once, applies everywhere)
- `assets/app.js` — shared behavior + Mission Control AI assistant
- `api/chat.js` — secure serverless proxy for the AI (Vercel)
- `api/chat.cloudflare-worker.js` — same proxy, Cloudflare version
- `sitemap.xml`, `robots.txt` — search + AI-engine discovery
- `build/generate.py`, `build/pages.py` — content-as-data source (edit words, rebuild)
- `Launchpad_Website_AI_Operations_Manual.docx` — Karen's SOP

## Before launch (placeholders to replace)
1. **Address spelling** — confirm "Claremont" vs "Clearmont" matches GBP + license; make all identical.
2. **HouseCall Pro booking is wired (direct link + on-site modal). Booking token configured.
3. **Comfort Club table** — pricing is correct; verify Plus/Premium checkmarks on bottom 4 rows vs flyer.
4. **Geo coords** — replace lat/lng in `build/generate.py` with exact shop coordinates.
5. **og-image.jpg** — add a 1200×630 share image to `assets/`.
6. **Attorney review** — membership terms are binding; have FL counsel review.

## Deploy (Vercel, free)
1. Create a Vercel account, import this folder.
2. Point launchpadservices.com at it.
3. Add env var `ANTHROPIC_API_KEY` (Settings → Environment Variables).
4. Ensure each page has `<script>window.MC_ENDPOINT="/api/chat";</script>`.
5. Redeploy. AI assistant is live.

## Rebuild after editing content
```
cd build && python3 pages.py
```
