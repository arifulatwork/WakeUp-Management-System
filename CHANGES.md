# Coordinator: review before approving + undo approval

- The Coordinator's "Review & confirm" now opens the same review pop-up the Manager uses (new shared `components/TaskReview.tsx`): checklist ticks, timing, task notes, photos/videos (when media is on) and the automatic check. Nothing is approved until "Confirm ready for check-in" is pressed there; "Send back" is in the same pop-up.
- New "Undo approval" button (Coordinator cards and Manager table) for approved jobs: asks first, then moves the job back to "To be verified" so it can be reviewed again, approved properly or sent back. New server action `unapprove` (office roles only, refused unless the job is Approved, written to the change history).
- Manager screen now uses the same shared review component (no behaviour change).

Changed: `app/coordinator/page.tsx`, `app/manager/page.tsx`, `app/api/tasks/[id]/route.ts`, `components/editors/TaskEditor.tsx`, `lib/i18n.tsx`. New: `components/TaskReview.tsx`. No database migration.

# Spec review fixes

- Task form: new cleaning type "Extraordinary"; new fields "Next check-in" (date) and "Products / materials needed". Both are saved on create AND edit (edit used to ignore the check-in date) and shown to the cleaner on the job screen.
- New issue form (Manager / Coordinator / Ops): photo button added (shown greyed out "Coming soon" while media is off).
- Maintenance app: "Time spent" is filled in automatically from the moment "Start intervention" was tapped (worker can still change it; works offline).
- Manager screen: date under the time, new "Timing" column and review line (start → finish · real minutes / estimate, red when over), and a "Report an Issue" button.
- Ops screen: "Houses with activity" now counts houses (was counting tasks); "Overdue work" now uses the scheduled day AND time (before, a job counted as overdue after 12:00 whatever its time) and no longer counts jobs already handed in for verification; the workload card is now a simple hours bar chart per person (worked today vs still planned, 8 h = full bar).

Changed: `app/manager/page.tsx`, `app/ops/page.tsx`, `app/maintenance/page.tsx`, `app/cleaner/page.tsx`, `app/api/tasks/[id]/route.ts`, `components/editors/TaskEditor.tsx`, `components/editors/TicketEditor.tsx`, `lib/i18n.tsx`, `lib/auditText.ts`. No database migration needed.

# Cleaner app: house status + photo/video visibility

- Cleaner job screen now has a "House status" box: key status, open maintenance problems (area, description, status) and "Confirmed ready for check-in" once the coordinator approved. Updates live when a ticket is opened/closed or the key status changes.
- House list shows red chips ("Key is missing", "Open issues (n)") only when something is wrong.
- `GET /api/tasks?workerId=` now adds `house.openIssues` (tickets not closed/rejected).
- Photo / video buttons are visible but greyed out ("Coming soon") while `NEXT_PUBLIC_MEDIA_ENABLED=false`; video on cleaning jobs added (`addVideo` / `removeVideo`, up to 3 × 6 MB).

Changed: `app/cleaner/page.tsx`, `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `components/Photos.tsx`, `lib/photoValidation.ts`, `lib/i18n.tsx`.

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
