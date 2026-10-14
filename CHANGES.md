# Notification history + sound

- Every notification is now saved per person (new `Notification` table) and listed in the bell on the cleaner and maintenance screens: newest first, with "just now / 20 minutes ago / 1 hour ago / yesterday" in the user's language, unread highlighted, red badge with the unread count.
- A short "ding" (plus vibration on phones) plays when a new notification arrives while the app is open. Sound can be switched on/off in the bell panel. Browsers need one tap on the screen before they allow sound.
- Phone push (app closed) now also vibrates; its sound is the phone's own notification sound.
- Works even if phone push is not configured (history + in-app sound only).

Database: run `npx prisma migrate deploy` (new migration `20261014120000_notifications`). Demo mode needs nothing.

New: `app/api/notifications/route.ts`, `lib/notifySound.ts`, `lib/timeAgo.ts`, `prisma/migrations/20261014120000_notifications/`.
Changed: `components/NotificationBell.tsx`, `lib/push.ts`, `lib/mockDb.ts`, `lib/i18n.tsx`, `lib/useLiveRefresh.ts`, `public/sw.js`, `prisma/schema.prisma`.

# Photos & videos switch

Photos/videos are built but OFF. Turn on later with `NEXT_PUBLIC_MEDIA_ENABLED=true` in `.env`, then rebuild.

New files: `lib/features.ts` (the switch), `lib/storage.ts` (file storage for your own server, not wired in yet), `.env.example`.

Changed (hidden when OFF): `components/Photos.tsx`, `components/HouseMedia.tsx`, `components/editors/{HouseEditor,TaskEditor,TicketEditor}.tsx`,
`app/coordinator/page.tsx`, `lib/readiness.ts` (no "No photo added" warning when OFF),
`lib/houseMedia.ts`, `app/api/houses/[id]/media/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/tickets/route.ts`, `app/api/tickets/[id]/route.ts`.
