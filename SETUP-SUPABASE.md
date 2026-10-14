# WakeUp Projects — run it on Supabase

Everyone signs in with a **username and password** — cleaners, maintenance, coordinators, managers and
admins. Accounts and data live in your Supabase (Postgres) database. Nobody can create their own account:
the Super Admin adds staff (**Staff & Roles → Add staff**).

## 1. Create the database
1. supabase.com → **New project**. Choose a region near you. Save the database password.
   (Avoid `@ # /` in the password, or URL-encode them.)
2. Click **Connect** (top of the project). Copy two strings:
   - **Transaction pooler** (port 6543) → `DATABASE_URL` (keep `?pgbouncer=true` at the end)
   - **Session pooler** (port 5432) → `DIRECT_URL`

## 2. Configure the app
The `.env` file in this folder is already set to real-database mode (`NEXT_PUBLIC_DEMO_MODE="false"`) and has a
`SESSION_SECRET` and a `SEED_PASSWORD`. Open it and replace the **two** `DATABASE_URL` / `DIRECT_URL` lines with the
strings from step 1 (replace `[PASSWORD]` too). Nothing else is needed.

## 3. Install and create the tables (PowerShell)
```
npm install
npx prisma migrate dev --name init     # creates every table in Supabase
npx prisma db seed                     # test houses, jobs and the six test accounts
```
The seed refuses to run if staff already exist (so it never doubles your data).

## 4. Run it
```
npm run dev
```
Open http://localhost:3000 — you land on the sign-in page. To open it on a phone on the same Wi-Fi:
`npm run dev -- -H 0.0.0.0`, then `http://<computer-ip>:3000`.
Check the data in Supabase → **Table Editor** (table `Worker` holds the accounts).

## Test accounts (password = `SEED_PASSWORD` from `.env`)
| Role | Username | Opens |
|---|---|---|
| Super Admin | giuseppe | /admin |
| Manager | cristina | /manager |
| Coordinator | pedro | /coordinator |
| Cleaner | maria, joao | /cleaner |
| Maintenance | ivan | /maintenance |

## Adding real staff
Sign in as `giuseppe` → **Staff & Roles → Add staff**: name, team, language, **username** and **password** (at least
8 characters). Give them those two things; they sign in on their phone. **Change password** in the same screen
resets it. Usernames are not case-sensitive.

## What changed from the old demo flow
- No self sign-up, no `/onboarding`, no `/dev-login`: every page and every API call needs a login.
- A cleaner or maintenance worker is always *themselves* on the server — the worker id sent by the phone is ignored
  and the one from the login is used, so nobody can act as a colleague.
- Sessions last 7 days. If one expires while someone is offline, their queued taps are kept and sent after they
  sign in again.

## Instant updates and phone notifications
**Instant updates** work by themselves: screens stay connected to `/api/events` and reload the moment anything
changes. They need the app to run as ONE server process (`npm run build && npm start` is exactly that). Behind a
proxy (nginx), turn off buffering for `/api/events` (the app already sends `X-Accel-Buffering: no`).

**Phone notifications** are optional:
1. `npm run vapid` prints a public and a private key. Put them in `.env` as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`,
   and set `VAPID_SUBJECT="mailto:your@email"`. Restart the app.
2. They need **HTTPS** (or `localhost`). Use Caddy or a Cloudflare Tunnel for a phone.
3. **iPhone:** open the site in Safari → Share → *Add to Home Screen*, open it from the icon, then tap 🔔
   (iOS 16.4 or newer). Android Chrome works directly.
4. On each phone tap **🔔 Enable notifications**, allow it, then **Send a test**.

## Before real staff use it
1. Change the six test passwords (Staff & Roles → Change password) or delete those accounts.
2. Keep `SESSION_SECRET` long and private; never commit `.env`.
3. Serve over HTTPS (Caddy or a Cloudflare Tunnel) — needed for the installable app and offline mode on phones.
4. Know the limits: login is a username/password check against your own `Worker` table (not Supabase Auth);
   there is no "forgot password" e-mail (the Super Admin resets it); photos are stored inside the database (move to
   Supabase Storage if it grows); screens update instantly only while the app runs as a single server process.

## Troubleshooting
- *"Supabase is not configured yet"* → `.env` still has `[PASSWORD]` / `[PROJECT-REF]`. Fill both URLs, restart `npm run dev`.
- *`P1001 can't reach database`* → use the **Session pooler** string for `DIRECT_URL` (the direct host is IPv6-only on many networks).
- *Wrong password for every account* → you changed `SEED_PASSWORD` after seeding. Reset a password in Staff & Roles, or empty the tables and seed again with `SEED_FORCE=true`.
