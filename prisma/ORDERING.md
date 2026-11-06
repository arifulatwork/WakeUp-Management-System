# Product ordering (students, coordinators, suppliers, admins)

Added on top of the cleaning platform. Nothing existing was removed: cleaner, maintenance, coordinator, manager and admin work as before.

## Roles
| Role | How they sign in | Screen |
|---|---|---|
| **Student** (new) | **Group code + their name** on the login page ("Student" tab). No username or password. | `/student` |
| **Supplier** (new) | username + password made by the admin (Staff & Roles -> Add staff, then set the role to *Supplier (warehouse)*) | `/supplier` |
| Coordinator (existing) | as before | `/group-orders` (and the old `/coordinator`) |
| Admin (existing) | as before | `/catalogue`, `/group-orders`, `/supplier`, `/admin` |
| Manager (existing) | as before | read-only `/group-orders` and `/catalogue`, plus reports |

## Group codes
- The admin creates a group (Groups & Orders -> Add group) and assigns its coordinator (optionally a house). Each group gets its own 8-character code.
- The coordinator sees the code on the group card: Copy, Switch off (locks every student of that group out at once), New code.
- A student enters code + name. First time = joins the group; the same name later = the same student.
- The coordinator registers each student's dietary requirements and can remove students.

## Flow
1. Admin sets up products (brand, standard quantity, dietary tags, approved alternatives), dietary requirements and the **ordering rules** (who orders, weekdays, cut-off time, approval on/off, quantity exceptions on/off).
2. Students (model "students send requests") pick products. A different quantity needs a reason. Dietary mismatches are flagged and suitable alternatives suggested.
3. The coordinator approves or rejects requests (can change quantities or drop lines). Approved lines merge into the group's order for the day, then "Send to supplier". In the "coordinator orders" model the coordinator builds the order instead.
4. The supplier sees consolidated quantities, marks each line prepared / partial / unavailable (optionally with an approved substitute), then dispatched and delivered.
5. Everyone in the chain sees the status live. Managers and admins get reports and history.

## Technical notes
- Migration: `prisma/migrations/20261102000000_group_ordering` (additive only). For Supabase mode run `npx prisma migrate deploy`. Demo mode needs nothing.
- Demo logins: `rita` (supplier, password `changeme123`). Students: login tab "Student", codes `AB12CD34` (Group A) and `EF56GH78` (Group B). Existing demo users are unchanged.
- `middleware.ts` blocks students and suppliers from every page and API except their own; each route also checks role and group.
- Ordering days and the cut-off use the server's clock (set `TZ` on the server).
- Permissions live in `lib/permissions.ts` and appear in the Admin "What each role can do" table.
