# WakeUp Projects — Client Demo Build

**This build runs with NO database and NO backend.** All data is realistic
sample data held in server memory, and a built-in simulator keeps it moving
(cleaners tick checklists, issues get reported, materials are requested,
maintenance closes tickets) so the dashboards look genuinely live.

```bash
npm install
npm run dev          # or: npm run build && npm run start
```

## Photos

- **Cleaner:** *Add before/after photo* on a job (up to 10 per job, tap to enlarge, × to remove) and *Attach photo* when reporting an issue.
- **Maintenance:** sees the cleaner's photo on the ticket; *Attach after-work photo* when closing it.
- **Coordinator / Manager / Ops:** thumbnails show on the job and ticket so the work can be verified; a reviewer can remove a bad photo.
- On the phone the camera or photo library opens; the photo is shrunk to ~1280px (~150 KB) before upload, and
  waits in the offline queue if there's no signal.
- The server only accepts JPEG/PNG/WebP, max ~650 KB each.
- **Demo storage:** photos live inside the in-memory data (like everything else in demo mode).
  **For the real backend:** upload to object storage (S3 / R2 / Supabase Storage) and save the returned URL in
  `checklistData.photos` / `photoUrl` / `afterPhotoUrl` — the screens only read "a URL". Also run a migration to add
  `MaintenanceTicket.afterPhotoUrl` (already in `schema.prisma`). Video is not supported.

## Roles & permissions

Defined once in `lib/permissions.ts`, **enforced on the server** (`lib/guard.ts`) and mirrored in the
UI (buttons a role can't use are hidden). The Admin screen shows the same table live under
**What each role can do**.

| | Staff (phone) | Coordinator | Manager | **Super Admin** |
|---|:-:|:-:|:-:|:-:|
| Do jobs on the phone, report issues, request materials | ✓ | ✓ report/request | ✓ report/request | ✓ report/request |
| Create & edit cleaning tasks, approve / send back | – | ✓ | ✓ | ✓ |
| Edit tickets & material requests, change key status | – | ✓ | ✓ | ✓ |
| Delete tasks, tickets, requests | – | – | ✓ | ✓ |
| Edit house details (name, address, listing dates) | – | – | ✓ | ✓ |
| Add houses | – | – | ✓ | ✓ |
| Delete houses | – | – | – | ✓ |
| Staff, roles, logins, **password reset**, "Open app" as any worker | – | – | – | ✓ |
| Screens | phone apps | Coordinator | Manager, Coordinator, Ops | all incl. Admin |

Safeguards: a Super Admin can't demote or delete themselves; staff with reported tickets / requests can't be
deleted (audit trail). A role change applies on the person's **next request** (the server reads the role from
the database, not from the login cookie). Cleaners and maintenance staff sign in too (username + password, created by the Super Admin) and are limited to
their own job actions; the server takes their identity from the login, never from the request.

## How lists are ordered

All ordering rules live in `lib/sort.ts` so every screen behaves the same way.

| List | Order |
|---|---|
| Cleaner phone — My Houses | job in progress first → then by day + time → finished jobs last |
| Manager table | click any column header (▲/▼ to reverse); default = day + time. Unassigned always last when sorting by person |
| Coordinator — houses | **Needs attention** first (waiting to verify → open problem → key missing → in progress → none → ready), or A–Z. Tasks inside a house by time, issues by priority |
| Maintenance / Ops — tickets | Priority (Red first, oldest first) · Newest · Oldest · House — buttons |
| Ops — material requests | longest-waiting first; fulfilled = latest three |
| Ops — keys | missing / with cleaner / with guest before "at office" |
| Ops — workload | busiest person first |
| Admin — staff / houses | click headers; staff default = admin → manager → coordinator → staff, A–Z |
| Dropdowns of people / houses | A–Z |

## What can be edited (everything)

| Screen | Create | Edit | Delete / other |
|---|---|---|---|
| **Coordinator** `/coordinator` | task, issue, material request, house | tasks (house, date, time, type, assignee, priority, minutes, notes, status, checklist), issues, houses, key status (dropdown) | delete task / ticket / house, **Confirm ready**, **Send back** |
| **Manager** `/manager` | task | any task, **Approve** / **Send back** | delete task |
| **Ops** `/ops` | issue, material request, house | tickets, requests, houses, key status | reject ticket, fulfil / reopen request, delete |
| **Admin** `/admin` | staff, house | name, team, language, role, login | delete staff / house |
| **Cleaner** (mobile) | issue, material request | checklist (tick / untick) | **Undo ready** |
| **Maintenance** (mobile) | – | accept / reject / start / materials / time; sort the queue by priority, newest, oldest or house | close ticket |

Deleting a house also removes its tasks, tickets and requests. A staff member who has
reported tickets or requested materials can't be deleted (audit trail) — change their
team or role instead.

## Languages (live switching)

The whole app switches language instantly — screens, buttons, statuses,
priorities, checklist items, even the demo tickets and material requests.
Portuguese, English, Spanish, French, Italian and Ukrainian are included.

- **🌐 picker, bottom-left of every screen** — change it any time, no reload.
- **Sign-in** — the person's saved language opens automatically after login.
- **Saved per person** — the choice is remembered on the device and written to the
  worker's `language` field. Logging in opens each person in their own saved language
  (João → Português, Ana → Español, Ivan → Українська, …).
- **Adding a language / text**: everything lives in one table, `ROWS` in `lib/i18n.tsx`
  (English text → one column per language). Wrap new UI text in `tr("…")`.
- Things typed by people (house names, free-text tickets) are shown as written;
  once real data exists, translating those needs a translation service.

Then open the app and:

| Show the client | Where | How |
|---|---|---|
| Cleaner's phone | `/login` | tap **Maria — Cleaning** (2 jobs) |
| Maintenance phone | `/login` | tap **Ivan — Maintenance** (open ticket queue) |
| Manager dashboard (live) | `/login` | tap **Cristina — Manager** |
| Coordinator readiness | `/login` | tap **Pedro — Coordinator** |
| Super Admin / roles | `/login` | tap **Giuseppe — Super Admin** |

Tip: open the manager dashboard on a laptop and Maria's phone view on a
phone side by side — tick a checklist item or report an issue on the phone
and it appears on the dashboard within seconds.

Maria and Ivan are never touched by the simulator, so their screens stay
stable while you present. A black **DEMO DATA** pill (bottom-right) has a
**Reset** button to restore the starting data between meetings.

- Data resets when the server restarts. Keep it on one running server
  (`npm run start`, VPS, or a tunnel) — not serverless hosting, which
  doesn't share memory between requests.
- Turn the background activity off with `DEMO_SIMULATE=false` in `.env`.

## Going live later (when the backend exists)

1. Set `NEXT_PUBLIC_DEMO_MODE="false"` in `.env` and fill in `DATABASE_URL`.
2. `npx prisma migrate dev` and `npm run seed` (or `migrate deploy` in production).
3. Delete `lib/mockDb.ts`, `components/DemoBadge.tsx`, `app/api/demo`.

Every API route talks to `lib/db.ts`, which switches between the demo store and
real Prisma — so no route or page code changes.

---

# WakeUp Projects — Cleaning & Maintenance (Phase 1)

Next.js (App Router) + PostgreSQL via Prisma. Covers only the core loop:
**Sign in → Cleaner checklist → Cristina's live dashboard.**

Issue reporting, maintenance tickets, materials requests, coordinator view,
ops overview, and super admin are intentionally not built yet — the DB
schema already has room for them (see `prisma/schema.prisma`) so nothing
here needs to be rewritten when you add them.

## Local setup

```bash
npm install
cp .env.example .env     # then edit DATABASE_URL
npx prisma migrate dev --name init
npm run seed              # loads mock data: houses, 5 workers, 4 tasks
npm run dev
```

Open `http://localhost:3000` — you land on `/login`. Sign in with any seeded account (see below); in demo mode
`/login` also shows one-tap buttons. There is no self sign-up and no quick-login page: every account has a password.

## Roles are data, not hardcoded people

There is no "Cristina" or "Giuseppe" in the code anywhere. Every worker
has a `role` field (`worker | manager | coordinator | admin`) on the
`Worker` model. Whoever currently holds the `manager` role sees
`/manager`; whoever holds `admin` sees `/admin`. Super Admin reassigns
roles from `/admin`'s Staff & Roles table, and it takes effect the next
time that person's app reloads — no code change, no redeploy, no
re-onboarding.

New staff always start as `role: "worker"` when the Super Admin adds them. Promote
someone from there.

## Pages

- `/login` — sign in (everyone)
- `/cleaner` — house list → task detail → checklist → mark ready
- `/manager` — live task table, priority, status, approve button. Shown to whoever has `role: "manager"` or `"coordinator"`
- `/admin` — Staff & Roles: reassign any worker's role, anytime. Shown to `role: "admin"`
- `/` — on every visit, fetches the worker's *current* role/area from the server and routes accordingly (this is what makes role changes take effect live)

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/workers` | POST | Super Admin adds staff `{ name, language, area, username, password }` |
| `/api/workers` | GET | List all workers |
| `/api/workers/:id` | GET | Fetch one worker's current role/area |
| `/api/workers/:id` | PATCH | `{ role }` — reassign a worker's role |
| `/api/houses` | GET / POST | List / add houses |
| `/api/tasks` | GET / POST | List (optionally by worker) / create tasks |
| `/api/tasks/:id` | PATCH | `start`, `toggleCheck`, `complete`, `approve`, `markIssue` |
| `/api/tickets` | GET / POST | List (`?open=1` for queue) / create maintenance tickets |
| `/api/tickets/:id` | PATCH | `accept`, `reject`, `start`, `close` |
| `/api/materials` | GET / POST | List (`?pending=1`) / create a materials request |
| `/api/materials/:id` | PATCH | `{ action: "fulfill" }` |
| `/api/houses/:id` | PATCH | `{ keyStatus }` — AT_OFFICE / WITH_CLEANER / WITH_GUEST / MISSING |
| `/api/auth/login` | POST | `{ username, password }` → sets session cookie |
| `/api/auth/logout` | POST | Clears the session cookie |
| `/api/auth/me` | GET | Current session's worker info |
| `/api/auth/register` | POST | Admin-only — set/reset a worker's login credentials |

## Auth — one login for everyone

**Everybody signs in at `/login`** with a username and password — cleaners, maintenance, coordinators, managers and
admins. Accounts live in the `Worker` table (Supabase when `NEXT_PUBLIC_DEMO_MODE="false"`), passwords only as
bcrypt hashes. `middleware.ts` requires a valid login cookie for every page and every `/api` call (except `/login`
and the login/logout calls). Sessions are a signed HMAC cookie (see `lib/session.ts`) — deliberately not a JWT
library, since the same verification code runs in the Node API routes and the Edge middleware, and Web Crypto
(`crypto.subtle`) works in both without adding a dependency.

What each role may do is decided per route (`lib/permissions.ts`, enforced by `lib/guard.ts`). Cleaners and
maintenance staff are always themselves on the server: `actingWorkerId()` replaces any worker id sent by the
browser with the one from the login.

**Adding people**: only the Super Admin, in `/admin` → Staff & Roles → **Add staff** (name, team, language,
username, password). There is no self sign-up. **Change password** resets one.

**Seeded accounts** (`npx prisma db seed`; password = `SEED_PASSWORD` from `.env` for all —
**change these before real use**):
- `giuseppe` — Super Admin
- `cristina` — manager
- `pedro` — coordinator
- `maria`, `joao` — cleaners
- `ivan` — maintenance

Set `SESSION_SECRET` in `.env` to a long random string in production —
the fallback in `lib/session.ts` is dev-only and clearly marked as such.

## Offline support (installable PWA)

Cleaners are often inside houses with weak or no signal — losing a
checklist tap because a request silently failed is exactly what makes
people give up and go back to WhatsApp. Two things solve this:

1. **`public/sw.js`** — a service worker that caches the app shell.
   Pages you've opened before load with zero signal; API GETs fall back
   to their last-known cached response instead of a blank error.
2. **`lib/offlineQueue.ts`** — mutating requests (checklist ticks,
   "mark ready," issue reports, materials requests, maintenance ticket
   actions) go through `queueFetch()` instead of raw `fetch()`. If the
   network call fails, it's saved to IndexedDB on the device and
   replayed automatically once back online (`components/OfflineBanner.tsx`
   handles both the `online` event and a periodic check, and shows a
   banner with the pending count). The UI updates optimistically either
   way, so nothing ever looks broken or unresponsive.

Deliberately **not** using the Background Sync API for this — iOS
Safari doesn't support it, and this needs to work on whatever phone a
cleaner actually has. Replaying on page-load + the `online` event
covers the same ground with no browser gap.

Real PWA icons (`icon-192.png`, `icon-512.png`) are generated from the
WakeUp Projects logo and already in `public/`, matching `manifest.json`.
Install prompts will work once this is served over HTTPS — see the
Cloudflare Tunnel section below.

**Known limitation**: the offline queue doesn't yet resolve conflicts if
the same task was also changed by someone else while a device was
offline — last write (the replay) wins. Fine for a small team; worth
revisiting once usage grows.

## Deploying on your Ubuntu server (matches our earlier setup)

1. **Postgres**: run it in Docker as discussed — see the DB setup card from earlier in this chat.
   ```bash
   docker run -d --name wakeup-db \
     -e POSTGRES_USER=wakeup -e POSTGRES_PASSWORD=<strong-password> \
     -e POSTGRES_DB=wakeup_dev -p 5432:5432 \
     -v wakeup_pgdata:/var/lib/postgresql/data postgres:16
   ```
2. **`.env`** on the server:
   ```
   DATABASE_URL="postgresql://wakeup:<strong-password>@localhost:5432/wakeup_dev"
   ```
3. **Run migrations + build**:
   ```bash
   npx prisma migrate deploy
   npm run build
   npm run start   # or run behind pm2 for auto-restart
   ```
4. **Public HTTPS URL** (required for the PWA / service worker / camera access):
   - Quick testing: `cloudflared tunnel --url http://localhost:3000`
   - More stable: DuckDNS + Certbot + Nginx reverse proxy to port 3000

5. **Seed a house or two** manually via `npx prisma studio` (opens a GUI
   at `localhost:5555`) so there's something for a cleaner to pick on
   first test — Phase 1 has no admin UI for adding houses yet, that's
   Phase 3 (Super Admin).

## Next build steps (in order, see chat for full reasoning)

1. Issue reporting → maintenance module (`MaintenanceTicket` model already exists)
2. Materials/products request
3. Coordinator view
4. Ops overview dashboard
5. Super Admin form builder (last — most complex, least defined)


---

## Added after the demo build

- **Audit trail** (`lib/audit.ts`, `lib/auditText.ts`, `GET /api/audit`, Super Admin → *Change history*): who changed what and when. Entries are stored as an English template + params and translated in the viewer's browser. Field names only, never passwords or photos; checklist ticks and photo uploads are not logged.
- **Instant updates** (`lib/events.ts`, `GET /api/events`, `lib/useLiveRefresh.ts`): every database write pings open screens over Server-Sent Events and they reload. Needs a single server process. A slow safety poll remains.
- **Phone notifications** (`lib/push.ts`, `lib/pushText.ts`, `/api/push/*`, `components/PushToggle.tsx`, `public/sw.js`): Web Push, optional, needs VAPID keys (`npm run vapid`) and HTTPS.
- **Retention** (`lib/retention.ts`): closed maintenance tickets older than 6 months are deleted, checked at most once an hour when tickets are listed.
- **Auto-check** (`lib/readiness.ts`): on the Coordinator screen, jobs waiting for verification show whether the checklist, photos, open tickets and key status look fine. It advises only; a person still confirms.
- **Supabase / Postgres**: see `SETUP-SUPABASE.md` and `.env.example`. `lib/db.prisma.ts` scrubs password hashes from every non-Worker query. Every page and API call needs a login (`middleware.ts`).
- Seed runs with `tsx` (`npx prisma db seed`); password from `SEED_PASSWORD`.
- Role instructions: `ROLE-GUIDES.md`.
- Still not built: video upload, automatic (rule-only) check-in approval, object storage for photos.
