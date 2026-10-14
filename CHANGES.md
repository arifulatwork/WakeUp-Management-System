# Photos & videos switch

Photos/videos are built but OFF. Turn on later with `NEXT_PUBLIC_MEDIA_ENABLED=true` in `.env`, then rebuild.

New files: `lib/features.ts` (the switch), `lib/storage.ts` (file storage for your own server, not wired in yet), `.env.example`.

Changed (hidden when OFF): `components/Photos.tsx`, `components/HouseMedia.tsx`, `components/editors/{HouseEditor,TaskEditor,TicketEditor}.tsx`,
`app/coordinator/page.tsx`, `lib/readiness.ts` (no "No photo added" warning when OFF),
`lib/houseMedia.ts`, `app/api/houses/[id]/media/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/tickets/route.ts`, `app/api/tickets/[id]/route.ts`.
