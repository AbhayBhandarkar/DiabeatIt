# DiabeatIT

**Everyday diabetes care for people in India aged 40–65 and their families.**
Health-a-thon 2026 India · Web app (installable on iPhone and Android) · Node.js + React + PostgreSQL

- **Live app:** https://diabeatit.onrender.com · **Website:** https://diabeatit.onrender.com/about
- **Demo video (2 min, captioned):** https://diabeatit.onrender.com/demo/DiabeatIT-demo.webm · Submission decks: [docs/submission](docs/submission)
- **Synthetic showcase login:** `sunita.sharma@example.com` / `Showcase-Sunita-2026!` (family companion: `priya.sharma@example.com` / `Showcase-Priya-2026!`)
- The free host sleeps after 15 minutes idle; the first request can take about a minute to wake it.

> DiabeatIT supports records, education and communication. It is **not a medical device**, does not diagnose, prescribe or change doses, and is not an emergency service (India: 112). The pilot runs on free-tier infrastructure: **use synthetic or test records only.**

---

## Contents
1. [What it does](#1-what-it-does)
2. [Architecture](#2-architecture)
3. [Run it locally](#3-run-it-locally)
4. [Configuration](#4-configuration)
5. [AI integration guide (for the on-device team)](#5-ai-integration-guide-for-the-on-device-team)
6. [HTTP API reference](#6-http-api-reference)
7. [Data model](#7-data-model)
8. [Security and privacy](#8-security-and-privacy)
9. [Deploying (Render + Neon, free)](#9-deploying-render--neon-free)
10. [Testing](#10-testing)
11. [Project layout](#11-project-layout)
12. [Known limitations](#12-known-limitations)

---

## 1. What it does

| Area | What the user gets | Where |
|---|---|---|
| **Today** | Greeting, last glucose, doses recorded today, meals, today’s schedule, glucose journal | `src/product/Home.tsx` |
| **Medicines** | Medicine list with schedules (IST), dose reporting (taken / not taken / unsure), history, “change map”, source documents, clarifications. **Scan prescription**: AI reads a photo, the patient checks every line, then it becomes the schedule | `Medicines.tsx`, `PrescriptionScan.tsx` |
| **Food** | Search Open Food Facts / USDA, barcode lookup, **meal photo AI** (identifies foods + rough grams, nutrition then comes from databases), original Indian cookbook | `Food.tsx`, `FoodCamera.tsx`, `Cookbook.tsx` |
| **Timeline** | Visits, lab results (HbA1c, lipids, kidney…), medicine starts/stops, missed doses, glucose, symptoms and questions on one line. **AI visit summary** with citations to each record. **Share with my doctor** (QR / link, read-only, 1–30 days, revocable, every view logged) | `Timeline.tsx`, `Summary.tsx` |
| **Clinician view** | `/doctor#<token>`: no account needed. Medicines table, lab trends, glucose plot, dose reports, questions, full timeline, **AI 30-second briefing** with citations. Print-ready | `Doctor.tsx` |
| **Learn** | **Myth check** (claim → verdict grounded only in curated NIDDK/NCCIH/MedlinePlus cards), interactive biology lesson, four narrated Manim videos with captions, transcripts and checkpoints | `Learn.tsx`, `MythCheck.tsx`, `shared/evidence.ts` |
| **Care circle** | Invite family with per-record read/write scopes; revocable; audit trail; appointment summary | `Care.tsx` |
| **Medicine insights** | DailyMed/openFDA label search (paracetamol → acetaminophen alias), same-ingredient overlap detection, **“Explain in simple words”** for any label excerpt | `Insights.tsx`, `ExplainExcerpt.tsx` |
| **Phone-as-key sign-in** | Computer shows a QR code; the signed-in phone scans it and taps the matching number; the computer is signed in without typing a password | `DeviceLogin.tsx`, `server/v2/sharing.ts` |
| **Website** | `/about`: product story, features, doctor flow, comparison, AI safety, pricing, QR to open on a phone | `Landing.tsx` |

Design: indigo/violet/coral palette, light + dark mode with explicit hover states, large-text option, 44px+ touch targets, separate desktop (sidebar) and phone (floating tab bar) layouts, iPhone home-screen install (`apple-touch-icon`, standalone manifest).

## 2. Architecture

```
 Phone / desktop browser (React 19 + Vite PWA)
   │  src/product/ai.ts ──► window.diabeatitOnDeviceAi (optional on-device models)
   │        └─ fallback ──► HTTPS /api/v2/ai/*            (same prompts, same schemas)
   ▼
 Express 5 API  (server/)  ── helmet CSP, origin + client-header checks, rate limits
   ├─ /api/v2/auth, /me, /spaces/*         accounts, sessions, records, sharing, audit
   ├─ /api/v2/device-login/*              QR phone-as-key sign-in
   ├─ /api/v2/clinician/*                 read-only doctor links
   ├─ /api/v2/ai/*  ──► server/v2/ai/provider.ts ──► Groq (qwen/qwen3.8-27b) or any OpenAI-compatible endpoint
   └─ /api/v2/knowledge, /foods          DailyMed · openFDA · Open Food Facts · USDA FDC
   ▼
 PostgreSQL (Neon in production; embedded PGlite for local development)
```

- **Shared contracts** live in `shared/` and are imported by both server and client: `v2.ts` (records + API types), `ai.ts` (AI schemas, prompts, normaliser), `timeline.ts` (timeline builder + prompt text), `evidence.ts` (myth-check sources).
- **Stateless server**: sessions, QR sign-ins and doctor links are rows in PostgreSQL, so more instances can be added behind a load balancer. (Rate-limit counters are per instance today; see limitations.)

## 3. Run it locally

Requirements: Node.js 22.12+ (CI uses 24), npm.

```bash
npm ci
cp .env.example .env          # then fill in keys you have (all optional)
npm run build
npm run start:local           # = tsx --env-file=.env server/index.ts  → http://127.0.0.1:3001
node scripts/seed-showcase.mjs http://127.0.0.1:3001   # optional synthetic patient + companion
```

- Development with hot reload: `npm run dev` (Vite on :5173 + API on :3001). Note `npm run dev`/`npm start` do not read `.env`; export variables in your shell or use `start:local`.
- Without `DATABASE_URL`, data is stored in embedded PGlite at `.data/diabeatit` (override with `PGLITE_DATA_DIR`; on Windows keep it outside OneDrive). Never run two servers on the same PGlite folder.
- Test on your phone over Wi-Fi: set `HOST=0.0.0.0` and `APP_ORIGIN=http://<your-pc-ip>:3001`. Camera features (QR scanning, photos) need HTTPS on phones, so use the deployed URL for those.

## 4. Configuration

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | prod | `production` turns on strict checks below and secure cookies |
| `HOST`, `PORT` | | Bind address (`0.0.0.0` on hosts) and port (default 3001) |
| `APP_ORIGIN` | prod | Exact public origin, e.g. `https://diabeatit.onrender.com`. Mutating requests from other origins are rejected |
| `COOKIE_SECURE` | prod | `true` behind HTTPS |
| `DATABASE_URL` | prod | PostgreSQL connection string (Neon: include `?sslmode=require`) |
| `SCHEMA_READY` | prod | Set `true` after `npm run db:migrate` (server refuses to start otherwise) |
| `PGLITE_DATA_DIR` | | Local embedded database folder |
| `TRUST_PROXY` | | `1` to trust one reverse proxy outside production |
| `FDC_API_KEY` | | USDA FoodData Central key for whole-food search (else Open Food Facts) |
| `AI_PROVIDER` | | `groq` (default when a key is present), `openai-compatible`, or `disabled` |
| `GROQ_API_KEY` / `AI_API_KEY` | | Provider key (server-side only, never `VITE_*`) |
| `AI_BASE_URL` | | Defaults to `https://api.groq.com/openai/v1`. Any OpenAI-compatible base URL; plain `http` only for localhost/private LAN |
| `AI_TEXT_MODEL` / `AI_VISION_MODEL` | | Default `qwen/qwen3.8-27b` for both |
| `AI_FALLBACK_TEXT_MODEL` | | Used when the main text model is rate-limited or returns invalid output (Groq default `openai/gpt-oss-20b`; empty to disable) |
| `AI_REASONING_EFFORT` | | Sent as `reasoning_effort` (default `none` for Qwen) |
| `AI_TIMEOUT_MS` | | Provider timeout (default 30000) |
| `AI_DEBUG` | dev | `1` logs rejected AI output **in development only**; never enable with real records |

## 5. AI integration guide (for the on-device team)

Every AI feature is a **narrow, schema-checked job**. The model never writes to the database: the app shows a draft, the user confirms, and only then is a normal record saved.

### 5.1 The five features

| Feature id | Input | Output schema (`shared/ai.ts`) | Used in |
|---|---|---|---|
| `foodPhoto` | meal photo (JPEG data URL) | `foodPhotoResult` → `{ items:[{name, estimatedGrams, uncertainty}], limitations }` | Food → Take a meal photo |
| `prescriptionScan` | prescription / strip photo | `prescriptionScanResult` → `{ medicines:[{name, ingredient, strength, form, timing:[morning|afternoon|evening|night], withFood, durationDays, confidence}], prescriber, date, limitations }` | Medicines → Scan prescription |
| `timelineSummary` | record text built by `timelinePrompt()` | `timelineSummaryResult` → `{ overview, sections:[{heading, points:[{text, refs[]}]}], questionsForVisit[], dataGaps[] }` | Timeline, Clinician view |
| `mythCheck` | claim + evidence cards | `mythCheckResult` → `{ verdict: myth|partly-true|supported|not-covered, headline, explanation, evidenceIds[], talkToDoctor }` | Learn → Check a claim |
| `labelExplain` | official label excerpt | `labelExplainResult` → `{ summary, keyPoints[], askPharmacist[] }` | Medicine insights |

System prompts: `aiPrompts[feature]`; user turns: `userPrompts[feature](...)`. **Reuse both verbatim** so on-device and server behaviour match. After the model replies, the app runs `extractJson()` → `fitToSchema()` (trims over-long strings, turns `"a; b"` into lists, drops empty entries) → the Zod schema. Unknown or invalid output is discarded. Summary citations that do not match a supplied record id are removed (`keepKnownRefs`); myth-check evidence ids are mapped only to known cards.

### 5.2 Option A — run models on the phone (browser adapter)

`src/product/ai.ts` checks for a global adapter before calling the server:

```ts
window.diabeatitOnDeviceAi = {
  name: 'DiabeatIT Mobile (Qwen 0.5B + SmolVLM)',          // shown to the user as the engine
  supports: (feature) => ['foodPhoto', 'mythCheck', 'labelExplain', 'timelineSummary', 'prescriptionScan'].includes(feature),
  complete: async ({ feature, system, user, image }) => {
    // image: JPEG data URL (≤1600 px) for foodPhoto / prescriptionScan, otherwise undefined
    return await myRuntime.generate({ system, user, image, json: true });   // return the raw reply text
  },
};
```

- Register it any time (e.g. a script tag loaded before `/src/main.tsx`, or a WebView bridge in a native wrapper).
- If `complete` throws or returns invalid JSON, the app silently falls back to the server endpoint.
- The UI labels the result “On-device · <name>” vs “Server model”.
- For the timeline summary the client builds the record text locally (`timelinePrompt(snapshot.entities, today, fromDate)`), so **records do not leave the phone** when the adapter handles it.

### 5.3 Option B — point the server at your model gateway

If the models run in a local service (llama.cpp server, vLLM, Ollama, LM Studio, MLC) that speaks OpenAI `/v1/chat/completions`:

```bash
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://192.168.1.20:8080/v1     # https anywhere, http only on localhost / private LAN
AI_API_KEY=optional
AI_TEXT_MODEL=qwen2.5-1.5b-instruct
AI_VISION_MODEL=smolvlm-500m-instruct
AI_REASONING_EFFORT=                        # empty if your server rejects the field
AI_FALLBACK_TEXT_MODEL=
```

Request sent (`server/v2/ai/provider.ts → callModel`):

```json
{ "model": "<AI_TEXT_MODEL | AI_VISION_MODEL>", "temperature": 0.2, "max_completion_tokens": 1000,
  "response_format": { "type": "json_object" },
  "messages": [ { "role": "system", "content": "<aiPrompts[feature]>" },
                { "role": "user", "content": "<text>" | [ { "type": "text", "text": "…" }, { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,…" } } ] } ] }
```

Expected reply: `choices[0].message.content` containing one JSON object (code fences and `<think>` blocks are tolerated).

### 5.4 Where to change things

| To change | Edit |
|---|---|
| Prompts / output shapes | `shared/ai.ts` (`aiPrompts`, `userPrompts`, `*Result` schemas) |
| Provider selection, retries, cache, fallback | `server/v2/ai/provider.ts` (`aiConfig`, `runAi`, `callModel`) |
| Endpoint behaviour | `server/v2/ai/routes.ts` |
| Client routing / on-device adapter | `src/product/ai.ts` |
| Myth-check sources | `shared/evidence.ts` |
| Tests to keep green | `tests/v2.ai-sharing.test.ts` |

Behaviour notes: identical requests are cached in memory for 30 minutes; one automatic retry on HTTP 429 with `retry-after ≤ 8s`, then the fallback text model. Groq’s free tier allows roughly **1,000 output tokens per minute for `qwen/qwen3.8-27b`**, so expect “assistant is busy” under load.

## 6. HTTP API reference

Base path `/api/v2`. JSON in/out. Every non-GET request must send `X-Diabeatit-Client: web` and (if present) an `Origin` equal to `APP_ORIGIN`. Errors: `{ "error": "<safe message>", "code": "<CODE>" }`. Session: HttpOnly `diabeatit_account` cookie (SameSite=Strict, path `/api/v2`, 7 days).

### Public (no session)
| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ status }` |
| POST | `/auth/register` | `{ name, email, password(≥12), consent:true }` | `MeResponse + recoveryCodes[8]` (shown once) |
| POST | `/auth/login` | `{ email, password }` | `MeResponse` |
| POST | `/auth/recover` | `{ email, recoveryCode, newPassword }` | `{ ok }` |
| POST | `/device-login/start` | | `{ id, secret, match, expiresAt }` (2 min) — desktop keeps `secret` |
| POST | `/device-login/poll` | `{ id, secret }` | `{ status: pending|approved|denied|expired, me? }` (sets cookie once on approval) |
| POST | `/clinician/view` | `{ token }` | `ClinicianView` (patient name, period, medicines, intakes, glucose, appointments, labs, symptoms, questions, meals) |
| POST | `/clinician/summary` | `{ token }` | `TimelineSummaryResult` for the shared period |

### Account
| Method | Path | Notes |
|---|---|---|
| GET | `/me` | user, spaces, default space |
| POST | `/auth/logout` · `/auth/password` | password change revokes all sessions |
| DELETE | `/account` | `{ password, confirmation:'DELETE' }` |
| GET | `/device-login/:id` | phone: device description + three number choices |
| POST | `/device-login/:id/approve` | `{ match }` — one attempt; a wrong number blocks the request |
| POST | `/device-login/:id/deny` | |

### Records (space = one patient’s workspace)
| Method | Path | Notes |
|---|---|---|
| GET | `/spaces/:spaceId` | snapshot: entities by kind (only readable scopes), grants, invitations, audit (owner) |
| GET | `/spaces/:spaceId/export` | owner JSON export |
| GET | `/spaces/:spaceId/audit?before=` | owner audit pages (500) |
| POST | `/spaces/:spaceId/entities` | `{ kind, data }` (see data model) |
| PUT | `/spaces/:spaceId/entities/:id` | `{ version, data }` optimistic concurrency |
| DELETE | `/spaces/:spaceId/entities/:id` | `{ version }` |
| GET | `/spaces/:spaceId/documents/:id` | file download (sandboxed) |
| POST | `/spaces/:spaceId/invitations` | owner: `{ label, scopes[] }` → one-time token (48 h) |
| POST | `/invitations/accept` | `{ token }` |
| DELETE | `/spaces/:spaceId/grants/:id` · `/spaces/:spaceId/invitations/:id` | revoke |
| GET/POST | `/spaces/:spaceId/clinician-links` | owner: list / create `{ label, days(1–30), fromDate }` → token shown once |
| DELETE | `/spaces/:spaceId/clinician-links/:id` | withdraw |

### Knowledge
| Method | Path | Source |
|---|---|---|
| GET | `/knowledge/medicines?q=` | DailyMed SPL search (with India-name aliases, e.g. paracetamol) |
| GET | `/knowledge/medicines/:setid` | DailyMed detail + PDF link |
| GET | `/knowledge/labels?q=` | openFDA label sections (adverse reactions, warnings, interactions, indications) |
| GET | `/foods/search?q=` or `?barcode=` | USDA FDC (if key) / Open Food Facts |

### AI (signed in; 12 requests/min/account)
| Method | Path | Body |
|---|---|---|
| GET | `/ai/capabilities` | → provider, models, `features{}` |
| POST | `/ai/food-photo` | `{ image: dataURL, consent: true }` |
| POST | `/ai/prescription-scan` | `{ image: dataURL, consent: true }` |
| POST | `/ai/timeline-summary` | `{ spaceId, fromDate? }` (default last 180 days) |
| POST | `/ai/myth-check` | `{ claim }` (3–300 chars) |
| POST | `/ai/label-explain` | `{ medicine, section, text }` |

Images: JPEG/PNG/WebP data URL ≤ 2 MB, verified by file signature, never stored.

## 7. Data model

Entities are versioned JSON rows (`v2_entities`) inside a space, validated by Zod (`server/v2/validation.ts`) and typed in `shared/v2.ts`:

`medicines`, `intakes`, `glucose`, `meals`, `recipes`, `documents`, `questions`, `tasks`, `symptoms`, `lessons`, `reviews`, **`appointments`** `{ date, clinician, specialty, facility, reason, notes, changes, followUp? }`, **`labs`** `{ name, value, unit, takenOn, notes }`.

Other tables: `v2_accounts` (scrypt hashes), `v2_sessions` (hashed tokens), `v2_recovery_codes`, `v2_spaces`, `v2_grants`, `v2_invitations`, `v2_documents`, `v2_audit` (immutable via trigger), `v2_qr_logins`, `v2_clinician_links`, `app_schema_versions` (current: 3). Migration: `npm run db:migrate` (advisory lock, single transaction).

## 8. Security and privacy

- Passwords: scrypt (N=32768). Tokens (sessions, recovery codes, invitations, QR secrets, doctor links) stored only as SHA-256 hashes.
- Cookies HttpOnly, SameSite=Strict, Secure in production; CSRF defence via origin + custom header checks.
- Helmet CSP (`default-src 'self'`), no third-party scripts or fonts; documents served with `sandbox` CSP.
- Per-IP and per-account rate limits on auth, writes, AI, QR and doctor links.
- QR sign-in: 2-minute single-use codes, number matching on the phone, a wrong number blocks the attempt, the desktop gets its own session, event written to the audit log.
- Doctor links: random 256-bit token in the URL fragment (not sent in server logs or Referer), 1–30 day expiry, revocable, every view audited, read-only, limited record kinds (no documents).
- AI: explicit consent for photos, photos not stored, fixed operator-configured endpoint (no user-supplied URLs), schema validation, prompt-injection notice in every system prompt, no PHI in logs.

## 9. Deploying (Render + Neon, free)

1. **Database (Neon):** create a project, copy the pooled connection string (`…?sslmode=require`). Run the migration once from your machine: `DATABASE_URL="<url>" npm run db:migrate`.
2. **Web service (Render):** New → Blueprint → this repo (`render.yaml`). Fill the secret prompts: `DATABASE_URL`, `GROQ_API_KEY`, `FDC_API_KEY`, `APP_ORIGIN` (= the service URL, e.g. `https://diabeatit.onrender.com`).
3. Wait for the health check (`/api/health`), then optionally seed the showcase: `node scripts/seed-showcase.mjs https://diabeatit.onrender.com`.
4. On iPhone: open the URL in Safari → Share → **Add to Home Screen**.

**Current deployment (5 Nov 2026):** Render service `diabeatit` (Singapore, free) auto-deploys from `main`. The database is a Neon *claimable* project (`tiny-mud-51973901`, Singapore) created without an account; it **expires on 8 Nov 2026 unless claimed**. To keep it: run `neon claim accept tiny-mud-51973901` on the machine that created it (or create a new Neon project and migrate), choose the organisation, then copy the new connection string into Render → Environment → `DATABASE_URL` (claiming rotates the password).

Free-tier facts (checked 5 Nov 2026): Render free web services sleep after 15 min idle (~1 min cold start) and get 750 instance-hours/month; Neon Free is permanent with 1 GB storage per project, 100 CU-hours/month and scale-to-zero. Paid upgrade path: Render Starter + Neon Launch (≈ US$7 + usage per month).

## 10. Testing

```bash
npm test              # Vitest: domain, API, auth, records, providers, AI + sharing, video assets
npm run test:e2e      # Playwright: desktop 1440, phone 390 and 320 px, light/dark, axe accessibility
node scripts/production-smoke.mjs
node scripts/capture-screens.mjs <baseUrl>   # product screenshots → artifacts/screens
node scripts/frame-screens.mjs               # iPhone-style frames → artifacts/framed
node scripts/record-demo.mjs <baseUrl>       # captioned walkthrough → public/demo/DiabeatIT-demo.webm
.venv/Scripts/python scripts/deck/build_deck.py   # both submission decks → docs/submission
```

## 11. Project layout

```
server/            Express app, runtime checks, migration
  v2/              accounts, records, sharing (QR + doctor links), providers, validation
  v2/ai/           provider.ts (OpenAI-compatible client), routes.ts (AI endpoints)
shared/            types + logic shared by server and client (ai, timeline, evidence, v2)
src/product/       React app: App shell, pages, AI client, theme.css, landing.css
media/             Manim lesson sources and build script (outputs in public/lessons)
scripts/           seed, screenshots, smoke tests, asset generation
tests/             Vitest suites and Playwright product e2e
docs/              status, validation, release plan, submission material
```

## 12. Known limitations

- Free hosting: cold starts, single instance, in-memory rate-limit counters and AI cache (per instance).
- Groq free tier output limits; AI summaries can be briefly unavailable under load. Free-tier AI is not appropriate for real patient data.
- Medicine overlap detection compares entered ingredients only; it is not a licensed drug-interaction database. Labels are US (DailyMed/openFDA); Indian brand coverage relies on the user entering the ingredient.
- No push notifications, CGM/device integrations, MFA/email verification, or native app-store builds yet.
- Not clinically validated; no regulatory approval. Lessons and AI prompts have not had formal clinical review.
- The original local development database (`.data/diabeatit`) is corrupted and was not recovered; it held only test data.
