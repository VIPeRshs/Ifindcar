# Team Tasks App — Design

Date: 2026-11-13
Status: draft, awaiting owner approval

> Lives temporarily in the Ifindcar repo. Moves to its own repository once
> the owner creates it.

## 1. Intent

The owner runs an engineering task board today: a Hebrew (RTL) web board
backed by a Google Sheet (`מעקב משימות`). It works for one person. The owner
wants a real app that a small team uses, where:

- several people each have their own tasks, but **not in isolated silos**:
  people see the work in the projects they belong to;
- the owner manages two of the future users and must see everything those
  two do; other users have other managers or none;
- tasks can be **moved from one person to another**;
- every task belongs to a **project**, and later each project gets a
  **Gantt chart** the tasks fit into;
- each person keeps a **personal, private area** (today's meetings, as the
  current board has).

The Google Sheet is abandoned after a one-time import. The app becomes the
system of record.

## 2. Goals, non-goals, anti-goals

**Goals (v1)**
- Android app + PC (web) from one codebase; iOS possible later with no rewrite.
- Hebrew, right-to-left UI throughout.
- Sign in with Google. Each user sees exactly what the visibility rules allow.
- Everything the current board does: status board with 4 columns and
  drag-to-move, "what to work on now" strip, "needs attention" panel, quick
  add, project filter, task editor, dated updates.
- Projects with a PM and participants; tasks with assignee; reassignment.
- Manager → reports relationship.
- Personal meetings area, private to each user.
- One-time import of the existing sheet.
- Data model ready for Gantt (dates on tasks and projects, dependencies field).

**Non-goals (v1)** — planned for later, data model must not block them:
- Gantt chart screen.
- Google Calendar sync for meetings (v1 has manually entered meetings).
- iOS build and App Store release.
- Push notifications.
- Play Store release (v1 is distributed as an APK file + web URL).

**Anti-goals** — failure even if it technically works:
- A user can see another user's personal area, or tasks in projects they
  are not in and do not manage.
- Ongoing two-way sync with Google Sheets (explicitly abandoned).
- English-first / LTR UI with Hebrew bolted on.
- Losing update history: today each update overwrites the last; the app
  must keep a log.

## 3. Constraints

- Small team (single-digit to low tens of users). Firebase free tier is enough.
- The owner is not expected to operate servers. No custom backend beyond
  Firebase (Cloud Functions only if strictly needed).
- Existing data: ~8 tasks; columns `מזהה, משימה, תחום / פרויקט,
  תת-משימה / פירוט, עדיפות, סטטוס, תאריך יעד, עדכון אחרון / הערות`.
  Dates are `DD/MM/YYYY`; the update column ends with a `(DD/MM/YYYY)` date.
  A second tab `פגישות` holds meetings (date, start, end, title, location).

## 4. Approaches considered

| Approach | Trade-offs |
|---|---|
| **Flutter + Firebase (chosen)** | One codebase → Android, web for PC, iOS later. Strong RTL, Gantt packages exist. iOS later needs a Mac + Apple developer account. |
| Installable website (PWA) + Firebase | Simplest, no stores, closest to current board. Weaker app feel and notifications, especially on iPhone. |
| Native Kotlin Android + separate website | Best Android feel, but two (later three) codebases. Doesn't fit Android + PC + iOS. |

The owner picked Flutter + Firebase.

## 5. Decisions made with the owner

- New dedicated repository (owner creates it; session cannot).
- Firebase Auth (Google sign-in) + Cloud Firestore.
- Sheet is a one-time import, then retired.
- Each project has a PM chosen at creation; anyone can hold tasks in a
  project without owning it; participants see all tasks in the project.
- Managers see all tasks of their direct reports, in any project.
- Not everyone is managed by the owner; manager is a per-user relationship.
- Each user has a private personal area (meetings).
- Gantt is a future feature; tasks and projects carry dates now.

## 6. Design

### 6.1 Roles and visibility

See ADR-001 (`docs/adr/ADR-001-project-manager-and-participants.md`).

- **User**: anyone signed in who has been added to the team.
- **Admin**: can add users, set each user's line manager, create projects.
  The owner is the first admin.
- **Line manager of X**: user listed as X's `managerId`. Direct reports only
  (not transitive) in v1.
- **Project manager (PM)**: the single `pmId` chosen when the project is
  created (not necessarily the creator).
- **Project participant**: in the project's `participantIds`: the PM, anyone
  ever assigned a task there (added automatically), and anyone the PM adds.
  Users can hold tasks in a project without owning it. Participation is
  sticky; the PM can remove someone only if they have no open tasks there.

| Action | Who |
|---|---|
| Create project, choose its PM | Admins and line managers *(proposal, awaiting owner)* |
| Change a project's PM | Admin, or current PM |
| Edit project, add/remove participants | PM, admin |
| Create a task in a project | Any participant; PM; a line manager for a report |
| Assign / reassign a task to anyone on the team | PM; assignee's line manager; admin |
| Read all tasks in a project | Participants, PM, admin |
| Read some tasks in a project | Line managers: their reports' tasks only |
| Edit a task (status, fields, updates) | Anyone who can read it |
| Move a task to another project | Same right as creating a task there |

A line manager who is not a participant sees the project's name and dates
(needed on cards and filters), but only their reports' tasks in it.

User changes *(my calls)*:
- Deactivating a user (`active: false`) blocks their sign-in; their tasks
  stay and show as "inactive user" so a PM, line manager or admin reassigns them.
- Changing a user's line manager updates `assigneeManagerId` on all their tasks.

Personal area: readable/writable by its owner only. Admins do **not** see
others' personal areas.

These rules are enforced in Firestore Security Rules, not only in the UI.

### 6.2 Data model (Firestore)

```
users/{uid}
  displayName, email, photoUrl
  managerId: uid | null
  isAdmin: bool
  active: bool

invites/{email}          # admin pre-registers an email; on first sign-in
  managerId, isAdmin     # the user doc is created from it. Unknown emails
                         # are refused.

projects/{projectId}
  name                    # e.g. "גלים גבוהים 872"
  pmId: uid               # project manager, chosen at creation
  participantIds: [uid]   # PM + task assignees (auto) + manual adds; sticky
  startDate, endDate: date | null      # for Gantt
  archived: bool

tasks/{taskId}
  number: int             # human-friendly running number (#7), unique per team
  title
  details                 # was "תת-משימה / פירוט"
  projectId
  assigneeId: uid
  priority: high | medium | low
  status: notStarted | inProgress | waiting | done
  startDate: date | null  # new, for Gantt
  dueDate: date | null
  dependsOn: [taskId]     # stored, no UI in v1
  lastUpdateText, lastUpdateAt   # denormalized for cards/attention panel
  createdAt, createdBy, updatedAt
  # denormalized for security rules / queries:
  projectParticipantIds: [uid]
  assigneeManagerId: uid | null

tasks/{taskId}/updates/{updateId}
  text, at, byUid
  kind: note | statusChange | reassign | created

users/{uid}/meetings/{meetingId}     # private
  date, start, end, title, location
```

Denormalized fields (`projectParticipantIds`, `assigneeManagerId`) keep security
rules cheap and let the app query "tasks I can see" with array-contains /
equality queries. They must be kept consistent when project participants or a
user's manager changes. Cloud Functions need Firebase's paid Blaze plan, so
v1 stays on the free Spark plan and does this with **client batch writes**,
with Security Rules validating the denormalized fields. *(My call.)*

Status labels in Hebrew: לא התחיל / בביצוע / ממתין / הושלם.
Priority labels: גבוהה / בינונית / נמוכה.

### 6.3 Screens (v1)

1. **Sign-in** — Google button. Unknown email → "ask your admin to add you".
2. **Board (home)** — carries over the current board:
   - stats line (open, in progress, waiting, high priority, overdue);
   - "today" panel: my meetings today + next meeting;
   - "needs attention": overdue, due today/tomorrow, waiting ≥ 7 days since
     last update, high priority not started — same rules as today;
   - "what to work on now": top 3 open non-waiting tasks, in-progress first,
     then priority, then due date;
   - quick add (title, project, priority; assignee defaults to me);
   - filters: **scope** (mine / my team / project) and **project chips**;
   - 4 status columns, drag to change status (long-press on phone);
     "done" column shows 5 latest with "show all".
   - Each card shows assignee avatar/initials in addition to today's info.
3. **Task editor** — title, project, assignee (picker limited by reassign
   rights), start date, due date, status, priority, details, add update;
   full update history list.
4. **Projects** — list of my projects; project page with PM, participants,
   dates, its tasks. PM/admin can add/remove participants. "New project":
   name, PM picker, dates, optional participants.
5. **My team** (managers only) — reports listed with their open/overdue
   counts; tap → board filtered to that person.
6. **Personal** — my meetings: list by day, add/edit/delete.
7. **Admin** — invite user by email, set manager, toggle admin.
8. **Import** (admin, one-time) — see 6.5.

Layout adapts: phone = single column with tabs for status lanes; PC/wide
= the 4-column board like today.

### 6.4 Platforms and distribution

- Android: APK built in CI (GitHub Actions), downloadable from releases.
- PC: Flutter web build hosted on Firebase Hosting.
- iOS: not built in v1; nothing Android-only may be used without a web/iOS
  path.

### 6.5 Import from the Google Sheet

Run once by an admin, from the app (web or Android):
- Reads `מעקב משימות` and `פגישות` from sheet ID
  `1Bbo5uoUXLtiKYRpu9npCU-jLvpW-XhGHKjmcuQnlez4` using the signed-in
  admin's Google account (Sheets read-only scope).
- Creates a project per distinct `תחום / פרויקט` value (PM = importer,
  participants = [importer]).
- Creates tasks assigned to the importer, keeping their `מזהה` as `number`.
- Parses `DD/MM/YYYY` dates; the update column becomes the first update
  entry, dated from its trailing `(DD/MM/YYYY)`.
- Meetings go into the importer's private meetings.
- Shows a preview with counts before writing; safe to run once (refuses if
  tasks already exist, unless confirmed).

*(Alternative left to builder: a one-off script instead of an in-app screen,
if simpler. Owner-facing result must be the same.)*

## 7. Future (shape only, not in v1)

- **Gantt**: per-project timeline, bar per task from startDate to dueDate,
  arrows from `dependsOn`, project bounds from project dates.
- Google Calendar → personal meetings.
- Push notifications (assigned to me, due tomorrow).
- iOS build.

## 7a. Reference: the current board

Source: claude.ai artifact `564db1e9-c893-4fe9-bec0-1823f3915fb9`
(owner's "לוח משימות הנדסה"). Rules to carry over exactly:
- "Today" = local device date; day differences computed at local midnight.
- Overdue: open task with dueDate before today.
- Needs attention, in this order: overdue ("באיחור N ימים"), due today,
  due tomorrow, waiting with last update ≥ 7 days ago, high priority not
  started.
- Open-task sort: priority (high→low), then due date (none last), then number.
- "What to work on now": open and not waiting; in-progress first, then the
  open-task sort; top 3.
- Card age badge: "עודכן לפני N ימים", warn at ≥10 days (≥7 when waiting).
- Quick "advance" button: לא התחיל→בביצוע ("התחל"), בביצוע→הושלם ("סיים ✓"),
  ממתין→בביצוע ("חזר לביצוע"); a status change logs an automatic update.
- Look: teal accent (#0E6B63 light / #4FB8A9 dark), IBM Plex Sans Hebrew,
  IBM Plex Mono for numbers/dates, priority shown as a colored edge on cards
  (red/amber/grey), light and dark themes.

## 7b. Setup and infrastructure

- New GitHub repository, created by the owner; the session then attaches it.
- Firebase project created by the owner following written steps the builder
  provides (free Spark plan); the builder supplies config files and rules.
- Android release keystore generated once, stored as a GitHub Actions
  secret; CI builds the APK and the web build. Hosting deploy via CI.

## 8. Left to the builder

- State management, folder structure, packages (RTL/Hebrew fonts, date
  pickers), testing approach.
- How denormalized fields are kept in sync (Cloud Function vs admin batch).
- Running task `number` generation (counter doc + transaction is fine).
- Exact visual styling; follow the current board's look (teal accent,
  IBM Plex Sans Hebrew, light/dark).
