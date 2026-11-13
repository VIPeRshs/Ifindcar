# ADR-001: Project manager role and task-driven project participation

**Status:** Proposed
**Date:** 2026-11-13
**Deciders:** App owner (team lead)

## Context

The team tasks app (see `docs/superpowers/specs/2026-11-13-team-tasks-design.md`)
groups every task under a project. The owner has now specified:

- A project is **created with an assigned project manager (PM)**. The PM is
  not necessarily the person who creates it.
- **Other users can hold tasks in that project without owning it.** The
  project is not limited to a pre-agreed member list.

Earlier decisions that still apply:
- People see **all tasks in the projects they work on**.
- Line managers see all tasks of their direct reports, in any project.
- Each user's personal area is private.
- Stack: Flutter + Firebase (Firestore, Security Rules, free Spark plan, so
  there are no Cloud Functions).
- Small team, roughly 5–20 users.

The open question is how "the projects they work on" is defined, so that
rules and queries stay simple and nobody sees too much or too little.

## Decision

1. `projects/{id}` gets a single **`pmId`** (the project manager), set at
   creation. This replaces the earlier `ownerId`.
2. Project visibility comes from a **`participantIds`** array on the project.
   It holds:
   - the PM, always;
   - **anyone assigned a task in the project, added automatically** in the
     same batch write that creates or reassigns the task;
   - optional extra people the PM adds by hand (for example a reviewer
     with no tasks yet).
3. Participation is **sticky**: reassigning a task away does not remove the
   person. The PM can remove a participant only when that person has no
   open tasks in the project.
4. Rights:

| Action | Who |
|---|---|
| Create project, choose its PM | Admins and line managers *(proposal)* |
| Change a project's PM | Admin, or the current PM |
| Edit project details/dates, add or remove participants | PM, admin |
| Create a task in the project | Any participant; the PM; a line manager for a report |
| Assign or reassign a task to **anyone on the team** | The PM; the assignee's line manager; admin |
| Read all tasks in the project | Participants, PM, admin |
| Read only some tasks in the project | Line managers (their reports' tasks only) |
| Edit a task (status, fields, updates) | Anyone who can read it |

5. Each task keeps the denormalized `projectParticipantIds` (a copy of the
   project's list) and `assigneeManagerId`, so Security Rules and queries
   don't need joins. Any change to `participantIds` rewrites the project's
   tasks in one client batch. At this team size that's a few dozen
   documents at most.

## Options Considered

### Option A: Explicit membership with auto-add on assignment *(chosen)*

| Dimension | Assessment |
|---|---|
| Complexity | Low–Med: one array, kept up to date on assignment |
| Cost | Free tier; batch writes stay tiny at this size |
| Scalability | Fine up to hundreds of tasks per project; would need Functions far beyond that |
| Team familiarity | Standard Firestore `array-contains` pattern |

**Pros:** Any user can get a task in any project, as required. One field
answers "who sees this project". Queries are simple. The PM can also add
people who have no tasks yet.
**Cons:** The copy on every task must be kept in sync, and the rules must
check it on writes.

### Option B: Membership derived purely from current task assignments

The participant list is recomputed from who currently holds tasks in the
project, with no stored manual list.

| Dimension | Assessment |
|---|---|
| Complexity | High: needs recalculation on every reassignment, which without Functions means fragile client logic |
| Cost | Same |
| Scalability | Same |
| Team familiarity | Unusual |

**Pros:** It's "pure", and nothing can go stale.
**Cons:** People lose sight of a project the moment their last task moves.
Nobody can be added before they have a task. It's hard to do safely
without a server.

### Option C: No project-level visibility (each person sees only their own tasks; the PM sees all)

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Cost | Same |
| Scalability | Best |
| Team familiarity | Simple |

**Pros:** Simplest rules.
**Cons:** It contradicts the owner's requirement that people see the other
tasks in projects they work on. Rejected.

## Trade-off Analysis

A and B both meet "anyone can have a task without owning the project". B
ties visibility to the current assignment, which surprises people and
needs server logic that the free plan doesn't provide. A trades a little
duplicated data for simple, predictable rules. Sticky participation means
a person who handed off work can still follow the project, which is what a
small engineering team expects. Line managers stay a separate path:
they see their reports' tasks without becoming project participants. That
keeps "my projects" lists clean.

## Consequences

- **Easier:** assigning work across projects. The Gantt chart later reads
  one project with known participants. "My projects" is a single query.
- **Harder:** any change to a participant list or a line manager must update
  the copies on tasks. Security Rules must reject writes that leave the
  copies inconsistent.
- **Revisit:** whether line managers (not only admins) should create
  projects. Whether participants need roles beyond PM (for example
  read-only). Moving to Cloud Functions if the team or project size grows a
  lot.

## Action Items

1. [ ] Owner confirms who may create projects (admins + line managers, or admins only).
2. [ ] Update the design spec: `ownerId` → `pmId`, `memberIds` → `participantIds`, and the rights table above.
3. [ ] Write Security Rules for the table above, with emulator tests for each row.
4. [ ] "New project" screen: name, PM picker, dates, optional participants.
5. [ ] Task create/reassign: a batch write that adds the assignee to `participantIds` and refreshes the copies on tasks.
6. [ ] Importer: each imported project gets PM = importer.
