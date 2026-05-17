# MSCE Website (Promo + Admin Portal)

Unified Vite app: public institute guide at `/`, MSCE council admin at `/admin`.

| Route | Purpose |
|-------|---------|
| `/` | Institute instructions, app screenshots, APK link |
| `/admin` | Authorised MSCE admin portal (Supabase login) |

## Setup

```bash
npm install
cp .env.example .env.local   # then set Supabase keys
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` (same as the Flutter app).

## Commands

```bash
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

## Assets

- `public/images/` — promo screenshots
- `public/downloads/msce-attendance.apk` — add locally after build (not in git; file is large). For production, upload APK to hosting or GitHub Releases and link from the site.
