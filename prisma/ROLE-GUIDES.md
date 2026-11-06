# WakeUp Projects — guide for each role

Languages: tap the 🌐 picker (bottom-left) on any screen. Your choice is remembered.

**Live screens:** you do not need to refresh. New jobs, issues and status changes appear by themselves within a second.

**Notifications (optional, every role):** tap **🔔 Enable notifications** (bottom-left, above the language picker), allow it, then **Send a test**. On iPhone, first add the app to the Home Screen and open it from there. Messages arrive in your own language. Turn them off with **Turn off**.
- Cleaner: new or reassigned job, job sent back, an issue you reported was fixed.
- Maintenance: new issue.
- Coordinator / Manager / Admin: job ready for check-in, materials requested, key missing, urgent issues.

---
## 1. Cleaner (phone)  — address: /cleaner
**First time:** open the app and sign in with the username and password your administrator gave you. Your saved language opens automatically. Use **Sign out** (top right) when you hand the phone over.

**Every day**
1. **My Houses** shows today's jobs in order (job in progress first, finished last).
2. Tap a job: see house, address, cleaning types, time, notes. Tap the address to open Google Maps.
3. **Start cleaning**.
4. Tick the **checklist** as you go (tap again to untick).
5. **Add before/after photo** (camera or gallery).
6. Problem in the house? **Report damage or issue**: choose room, priority (yellow/orange/red), describe, optionally attach a photo. It goes straight to Maintenance and marks your job "With issue".
7. Need products? **Request products / materials** and type what you need.
8. Finished? **Mark ready for check-in**. Pressed it by mistake? **Undo ready** — only works until someone verifies it.
9. No signal? An offline banner shows; your actions wait and are sent when the phone is online again.

---
## 2. Maintenance (phone)  — address: /maintenance
**First time:** sign in with the username and password your administrator gave you. Use **Sign out** (top right) when you hand the phone over.
1. **Open Tickets** lists problems (rejected ones are hidden). Sort by Priority, Newest, Oldest or House.
2. Tap a ticket: house, area, who reported it, when, description and photo.
3. **Accept** (assigns it to you) or **Reject**.
4. **Start intervention** when you begin work.
5. **Close ticket**: write materials used and time spent, optionally attach an after-work photo.

---
## 3. Coordinator  — sign in at /login, then /coordinator
Checks that houses are really ready.
1. One card per house: today's tasks, open problems, key status.
2. **Sort**: "Needs attention" shows houses needing action first, or sort by name.
3. **Key status** dropdown: At office / With cleaner / With guest / Missing.
4. Jobs waiting for verification show an **Auto-check**: green "all clear", or a list of what is wrong (checklist not finished, no photo, open maintenance problem, key missing). It is only advice.
5. Look at the photos, then **Confirm ready for check-in** or **Send back** (the cleaner gets the job again).
6. From any card: **+ Task**, **+ Issue**, **+ Materials**; tap a ticket to edit it.
7. You can create and edit; you cannot delete.

---
## 4. Manager  — sign in at /login, then /manager (also /coordinator and /ops)
Everything the Coordinator can do, plus delete and edit house details.

**/manager (task table)** refreshes by itself.
- Counters: scheduled/assigned, with issue, to be verified, approved.
- Click a column title to sort (click again to reverse).
- **New task / Edit**: house, date, time, cleaning types, cleaner, priority, estimated minutes, notes, status, custom checklist.
- **Approve** or **Send back** for finished jobs. **Delete task**.

**/ops (overview)**
- Tiles: houses with activity, urgent problems, completed today, overdue, open tasks, pending materials, missing keys.
- Open maintenance tickets: sort, edit, reject.
- Material requests (longest waiting first): add, edit, fulfil, reopen, delete.
- Key status per house (missing first) and staff workload.

---
## 5. Super Admin  — sign in at /login, then /admin
Everything above, plus:
1. **Staff table**: add, edit, remove people (name, team, language).
2. **Role**: change a person to Staff, Coordinator, Manager or Super Admin. It applies on their next action. You cannot demote or delete yourself.
3. **Logins**: give a Coordinator/Manager/Admin a username and password (min 8 characters); use the same to change a password.
4. **Open app**: step into any field worker's phone screen.
5. **Houses**: add, edit, delete. For Airbnb/Booking listings set valid-from and valid-until.
6. **Change history**: who changed what and when (newest first, updates by itself). Entries show in the language you have selected; names and notes stay as typed. Closed maintenance tickets are removed automatically after 6 months.
7. **What each role can do**: live permission table.

---
## Quick reference
| | Cleaner | Maint. | Coord. | Manager | Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Do jobs / tickets on phone | ✓ | ✓ | | | |
| Report issue, request materials | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/edit tasks, verify, key status | | | ✓ | ✓ | ✓ |
| Delete tasks/tickets/requests, edit houses | | | | ✓ | ✓ |
| Add/delete houses, staff, roles, logins | | | | | ✓ |
| Change history | | | | | ✓ |
