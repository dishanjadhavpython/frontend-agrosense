# Deploying AgroSense

Two halves, two hosts. That is not a preference, it is what the app is:

| Half | What it is | Where |
| --- | --- | --- |
| `src/` | The Next.js site and its three route handlers | Vercel |
| `backend/` | The reading service: OCR, three models, four research agents | Fly.io (or any Docker host) |

**Vercel cannot host the Python half.** torch unpacks to roughly 800 MB against
a 250 MB function limit; OCR needs the `tesseract` *binary* rather than a
Python package; the research sweep is an 11-minute background job rather than a
request; and uploaded cards, the vector index and the agent reports need a disk
that outlives the response. Each of those on its own rules it out.

Deployed without the Python half, the site still works — the homepage, every
crop, soil and fertilizer page, both languages, the theme. What stops working
is everything that reads a card, predicts, or shows current information; those
surfaces say the service is unreachable rather than pretending.

---

## 1. The reading service, on Fly

Fly rather than Render or Railway for one specific reason: `fly deploy` builds
from the working directory, while those build from a git push. The trained
models are 64 MB and `.gitignore` deliberately excludes `ML/models/`, so on a
git-based host they would have to be committed. A 64 MB binary blob in the repo
is a worse problem than a longer deploy command.

```bash
fly launch --no-deploy --copy-config          # claims the app name in fly.toml
fly volumes create agrosense_data --size 3 --region bom
fly secrets set \
  AGROSENSE_API_KEY="$(openssl rand -hex 32)" \
  OPENAI_API_KEY="sk-..."
fly deploy
fly logs                                       # first boot takes ~60s: torch
```

`fly deploy` builds on Fly's own remote builder, which produces the x86_64
image the machines need. **Do not add `--local-only` on an Apple Silicon Mac**
— that builds arm64, and the mismatch surfaces as an exec format error at boot
rather than as a build failure. To build locally anyway, name the platform:

```bash
docker build --platform linux/amd64 -f backend/Dockerfile -t agrosense-api .
```

Check it came up:

```bash
curl https://<your-app>.fly.dev/api/health
```

`models` should read `{"soil": true, "crop": true, "fertilizer": true}` and
`ocr_available` should be `true`. If OCR is false the tesseract packages did
not install; if a model is false, `ML/models/` did not make it into the image —
check `.dockerignore`.

### Environment

| Variable | Required | What it does |
| --- | --- | --- |
| `AGROSENSE_API_KEY` | **yes, once public** | Shared secret. See below. |
| `OPENAI_API_KEY` | for the agents | Without it the research sweep is a no-op and every detail page says updates are not switched on. |
| `AGROSENSE_DATA_DIR` | set in `fly.toml` | `/data`, the mounted volume. |
| `YOUTUBE_API_KEY` | optional | Real video results instead of a search link. |
| `DATA_GOV_IN_API_KEY` | optional | Government mandi prices. Free from data.gov.in. Without it every report's price section reports as unavailable — which is honest, but prices are the thing a farmer acts on. |
| `AGROSENSE_AGENTS_MODEL` | optional | Defaults to `gpt-4o-mini`. |
| `AGROSENSE_AGENTS_INTERVAL_HOURS` | optional | How long a report stays fresh. Default 8. |

### About `AGROSENSE_API_KEY`

`backend/app.py` was written on the assumption that only the Next server could
reach it — no accounts, no CORS, and a comment saying not to put it on a public
address. Hosting it breaks that assumption: `/api/ingest` accepts a 10 MB file
and spends CPU on OCR for anyone who asks.

So the service now takes a shared secret in `X-AgroSense-Key` and answers 401
without it. `/api/health` stays open so the platform's health check can reach
it; it reports what is loaded and nothing read off a card.

Unset means open, which keeps `git clone && npm run api` working with no
configuration. **Set it before the service has a public URL**, and set the same
value on Vercel.

A mismatch between the two is worth recognising, because it does not announce
itself: the service answers 401, which no route handler has a specific case
for, so card reads report "something went wrong reading the card" and detail
pages report the update service as unreachable. Both look like the service is
down rather than like a wrong key. If everything fails at once immediately
after a deploy, compare the two values first.

### Keep it to one machine

`min_machines_running = 1` and `auto_stop_machines = false` are in `fly.toml`
for the background sweep, not for traffic: the scheduler is a thread inside the
process, so a machine that suspends when idle stops researching. Equally, do
not scale past one — a second machine means a second scheduler researching the
same topics against the same volume and billing OpenAI twice.

---

## 2. The site, on Vercel

Import `dishanjadhavpython/frontend-agrosense` at
[vercel.com/new](https://vercel.com/new). Framework preset, build command and
output directory are all detected; nothing needs overriding.

Set two environment variables before the first deploy:

| Variable | Value |
| --- | --- |
| `AGROSENSE_API_BASE` | `https://<your-app>.fly.dev` — no trailing slash |
| `AGROSENSE_API_KEY` | the same secret you set on Fly |

Neither carries a `NEXT_PUBLIC_` prefix, deliberately: both are read only in
route handlers and in `src/lib/cardApi.ts`, which is `server-only`. The reading
service is never addressed from the browser.

If `AGROSENSE_API_BASE` is unset it falls back to `http://127.0.0.1:8000`,
which on Vercel is a dead loopback — the site builds and serves, and every data
surface reports the service as unreachable.

---

## Order

The site reads the service, not the other way round, so:

1. Deploy Fly, confirm `/api/health`.
2. Set both variables on Vercel.
3. Deploy Vercel.
4. Open a detail page and confirm the "Latest updates" panel fills. On a fresh
   volume it will say the topic has not been researched yet — that is correct,
   and it fills after the first sweep, which starts about 30 seconds after boot.

## Known gaps at the time of writing

- **Detail pages render a worked example, not your prediction.** They are
  statically generated from the fixture in `src/data/prediction.ts`, and only
  the five crops in that fixture have pages. A live prediction returning
  chickpea links to `/prediction/crop/chickpea`, which 404s. Fixing it means
  either writing editorial content for the other 17 crops or rendering a
  reduced page for crops that have none.
- **The research agents write in English** while the site is Marathi first.
  Their reports appear verbatim in the "Latest updates" panel.
