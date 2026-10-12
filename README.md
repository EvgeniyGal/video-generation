# Reels Studio

Personal tool to draft viral reel content (OpenAI), generate videos on demand (HeyGen Video Agent or Slideshow: OpenAI images + ElevenLabs + FFmpeg), schedule to multiple Buffer accounts, and sync post metrics daily.

## Stack

- Next.js (App Router) + custom Node server (`server.ts`)
- NextAuth (credentials, single operator)
- Supabase Postgres + Storage
- Drizzle ORM
- Docker / docker-compose

## Setup

1. Use your Supabase project (shared DB is fine). All app tables are prefixed with `vc_` so they won’t touch other apps’ tables.
2. Create a **public** Storage bucket named `videos` (or set `SUPABASE_VIDEOS_BUCKET`). Prefer a dedicated bucket for this app.
3. Copy `.env.example` → `.env` and fill values.
4. Install and apply schema + RLS (`vc_*` tables only):

```bash
npm install
npm run db:migrate
```

Or run the SQL files in [`drizzle/`](drizzle/) in the Supabase SQL editor (`0000` → `0001` → `0002` → `0003` → `0004` → `0005`).

**FFmpeg (Slideshow video):** Locally, install FFmpeg so `ffmpeg` and `ffprobe` are on your PATH (Windows: `winget install Gyan.FFmpeg`), then restart `npm run dev:server`. Docker images already include FFmpeg (see `Dockerfile` / `docker compose up --build`).

**RLS:** All `vc_*` tables have Row Level Security enabled with no policies for `anon` / `authenticated`. That clears Supabase’s “RLS disabled” warning and blocks accidental PostgREST access. This app talks to Postgres via Drizzle (`DIRECT_URL` / `DATABASE_URL`) and Storage via the **service role** — both bypass RLS. Do not add open `anon` policies on these tables.

5. Dev (Next only — cron jobs run with the custom server):

```bash
npm run dev
```

Or run the custom server (includes HeyGen poll, Slideshow jobs, + daily metrics cron):

```bash
npm run start:server
# or during development:
npm run dev:server
```

6. Docker (production-style; image includes FFmpeg + fonts for Slideshow karaoke):

```bash
docker compose up --build -d
```

## Workflow

1. **Settings** — save OpenAI / HeyGen / ElevenLabs keys; pick chat + image models; connect Buffer personal API keys (one per free account, ~3 channels each).
2. **Ideas** — add many reel ideas; **Prepare content** (OpenAI only).
3. **Drafts** — edit content, approve; **Generate video** → choose **HeyGen video** or **Slideshow video** and type-specific options.
4. **Videos** — wait for render; MP4 is re-hosted to public Supabase Storage.
5. **Schedule** — choose Buffer account channel → queue or custom time.
6. **Analytics** — daily 06:00 UTC sync (or Sync now).

## Buffer notes

- Metrics require a **personal API key** (`insightsRead`); OAuth app clients cannot read metrics.
- Video URLs must be public, HTTPS, and non-expiring until publish time.
