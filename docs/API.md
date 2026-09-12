# StudyFlow REST contract

Base path: `/api`. Requests and responses use UTF-8 JSON. IDs are positive integers. Responses use timestamps with a UTC `Z` suffix. Request dates must include a timezone. The session cookie is managed by the browser; API callers must maintain a cookie jar.

## Authentication sequence

1. `GET /auth/csrf` establishes an anonymous form session or returns the current session. Response: `{ "user": null | { "id", "email", "name" }, "csrf_token": "..." }`.
2. Send the returned token as `X-CSRF-Token` on every state-changing request.
3. `POST /auth/register` or `POST /auth/login` returns a new cookie and CSRF token. Replace the old CSRF token.
4. `POST /auth/logout` invalidates the server session and clears the cookie. Get a fresh anonymous CSRF session before another login.

CSRF bootstrap and registration/login are available without an authenticated user. All other listed data endpoints require authentication. Health does not require a session.

| Method | Path | Request / response |
| --- | --- | --- |
| GET | `/health` | `{status: "ok", service: "StudyFlow"}` |
| GET | `/auth/csrf` | Current user and CSRF bootstrap |
| POST | `/auth/register` | `name`, `email`, `password`; 201 and new session |
| POST | `/auth/login` | `email`, `password`; 200 and new session |
| POST | `/auth/change-password` | Authenticated; `current_password`, `new_password`, `confirm_password`; 200 with user and rotated CSRF/session, revokes other account sessions |
| GET | `/auth/me` | Authenticated user identity |
| POST | `/auth/logout` | Empty object; invalidates session |
| GET / POST | `/courses` | List owned courses / create course |
| GET / PATCH / DELETE | `/courses/{id}` | Owner-qualified read, partial edit, cascade delete |
| GET / POST | `/assignments` | List owned assignments ordered by deadline / create |
| GET / PATCH / DELETE | `/assignments/{id}` | Owner-qualified read, partial edit, cascade delete |
| GET | `/schedule` | `{sessions: [...], unallocated: [...]}` |
| POST | `/schedule/generate` | Replace future plan with chosen availability |
| PUT | `/schedule/settings` | Validate and save `timezone`, `start_hour`, `end_hour`, `daily_minutes`, `horizon_days`; return `{settings, conflicts: [{session_id, reasons}]}` without changing sessions. Reasons: `outside_hours`, `daily_budget`, `outside_window`, `busy_time` |
| GET / PATCH | `/sessions/{id}` | Read or adjust an owned future session |
| GET | `/summary` | Completion, overdue, upcoming work, future study minutes, course totals |
| POST | `/assignments/{id}/ai-suggestion` | Empty object; requires saved Notes. Transient labeled suggestion; 422 with `fields.notes` if missing or AI needs more requirements; 503 on provider/configuration failure |
| PUT | `/assignments/{id}/breakdown` | `{steps: ["..."]}`; accept/replace saved breakdown |

DELETE returns 204 without a body. All normal reads and edits return 200; course and assignment creation returns 201. Lists are owner-scoped on the server. Search/status/course filtering happens in the client over the owner's list; no user ID filter is accepted.

## Data schemas

Session responses include `outcome`: `pending` (default), `completed`, or `missed`. Pending means planned/unconfirmed, not proof of study. `PATCH /sessions/{id}/outcome` requires `{ "outcome": "completed" | "missed" }` and is allowed only once the entire session has ended. It is owner-scoped and CSRF-protected; invalid or early confirmations return 422. The original historical time and duration cannot be edited/deleted. Repeating the same choice is a no-op; either confirmed choice can be corrected later.

Completed sessions count as self-reported study minutes and change a Not Started assignment to In Progress. No check-in automatically completes or reopens an assignment. Missed sessions remain visible in history but contribute zero credited minutes across GET schedule, filling, regeneration, compensation and estimate trimming. Pending sessions still reserve planned minutes until confirmed; they are displayed in a check-in queue once ended. Marking missed does not move any existing session; it exposes missing work for Schedule remaining. Correcting missed to completed atomically trims any resulting excess from the assignment's latest future sessions. Started history remains immutable. Summary includes `confirmed_study_minutes`, separate from assignment completion counts and estimated completed-assignment effort.

Course creation requires `name` (1–120 characters). `code` defaults to an empty string (0–30 characters), and `color` defaults to `#2563eb` (six-digit hex). Responses contain `id`, `name`, `code`, and `color`.

Assignment creation requires `course_id`, `title` (1–200), `due_at`, `estimated_minutes` (integer 1–10080), `priority` (`High`, `Medium`, `Low`), and `status` (`Not Started`, `In Progress`, `Completed`). `notes` defaults to an empty string (maximum 4000). Responses also contain nested `course`, computed `overdue`, and accepted `breakdown` (null or string list). `breakdown` cannot be changed through ordinary assignment PATCH.

Assignments also accept `start_mode` (`now`, `week_before`, `custom`; default `now`) and `start_at` (nullable timezone-qualified timestamp). The legacy value `now` is displayed as **1 hour later** and means request time plus one hour for new automatic allocations and manually moved sessions. It stores no absolute lower bound. Retained sessions and duration-only edits keep their existing start; unrelated assignment edits do not restart the buffer or remove sessions. For `custom`, `start_at` is required and, if the deadline has not passed, must be at or before `due_at`; the UI sends local midnight for its date picker. Other modes clear `start_at`. Responses include both fields. The relative mode computes the bound as `due_at - 7 days` (168 hours) each time. PATCH validates combined old/new values. Switching to `now` or changing a custom/relative bound removes this assignment's future sessions before the new bound, preserving started sessions and other assignments. Remaining work can be added with Schedule remaining or full regeneration.

Reducing `estimated_minutes` atomically trims excess allocated minutes from this assignment's latest future sessions, deleting whole sessions or shortening the last retained one. Started/active sessions and other assignments are preserved. If started minutes already exceed the new estimate, all future sessions are removed; history remains unchanged. Increasing an estimate leaves existing sessions in place and exposes the difference as unallocated work.

`POST /schedule/fill-remaining` adds only unallocated minutes for incomplete assignments. All existing session IDs, times and durations are preserved and credited, including manual edits and sessions currently conflicting with busy time. New sessions avoid both existing sessions and busy intervals, honor earliest starts and applicable deadlines, and prioritize overdue backlog. Existing conflicts remain available for explicit conflict repair. Repeated calls cannot duplicate allocated work. The transaction uses the same owner lock as full generation, saves the supplied planning settings, and returns `{sessions, unallocated}`; unallocated includes reasons for any remaining shortfall. Explicit fill may reuse gaps released by earlier session edits/deletions.

Schedule generation, conflict repair and filling remaining work require timezone, start_hour, daily_minutes and horizon_days. The end_hour field is optional for older clients and defaults to 22; it must be an integer from 1 to 24, strictly greater than start_hour.

`daily_minutes` is the total study budget per local calendar day, not a continuous duration after `start_hour`. Candidates run from `start_hour` until `end_hour` on the same local day, skipping busy times. Preserved pending/completed study counts against that day's budget; missed sessions do not. Existing study is retained by fill/repair even if it already exceeds the budget, and no additional automatic study is placed on that day. This same rule applies to automatic compensation after session edits/deletion.

```json
{"timezone":"America/Los_Angeles","start_hour":9,"end_hour":22,"daily_minutes":180,"horizon_days":30}
```

Valid limits: IANA timezone, starting hour 0–20, daily minutes 30–240, horizon 1–90. Sessions contain `id`, `assignment_id`, `assignment_title`, `course`, `starts_at`, and `minutes`. Unallocated records contain assignment ID/title and remaining `minutes`; generation also returns a `reason`. GET recomputes remaining unallocated minutes without assigning a reason that could have become stale.

Session PATCH accepts `starts_at` and/or `minutes` (1–240), plus optional `settings` with the same planning fields as generation. Past/active sessions, times in the past, times before the assignment's earliest start, busy-time overlaps, overlaps with preserved earlier sessions, and sessions ending after a deadline that has not yet passed are rejected. When shortening, every other session is retained, so overlaps with any other session are rejected. Extending or moving without shortening resolves later-session overlaps through automatic compensation. Overdue work may use future sessions after its original deadline. An unchanged PATCH is a no-op. Assignment and course PATCH follow the same no-op rule; assignment date validation also checks related stored values.

`DELETE /sessions/{id}` deletes a future session and compensates its learning time later, without deleting the assignment. It accepts an optional JSON object containing `settings`; no body is also accepted. Generation/repair settings are persisted per user and returned as `settings` by schedule GET. Edits and deletion use those saved settings unless explicitly supplied; installations without saved settings fall back to 09:00/180 minutes/30 days (the UI supplies the browser timezone, direct API defaults to UTC).

Shortening a future session only changes that session. Its removed minutes become unscheduled work; the assignment estimate and every other session remain unchanged. This also applies when moving and shortening together, provided the new time passes validation. Use Schedule remaining to allocate missing work explicitly.

For extending, moving without shortening, or deleting, compensation atomically preserves started sessions, sessions earlier than the earlier of the original/new start, and the edited session itself. Other later sessions are replaced for their affected assignments, with remaining estimates recalculated from preserved minutes. New allocations start no earlier than the later of the original/new end, so this adjustment does not immediately refill the released slot. It respects the original planning horizon, busy times, earliest starts, overdue-first ordering and applicable deadlines. Unrelated assignments with no affected sessions are not pulled into the replan. Explicit filling or full generation can use those released slots again.

A shortening PATCH returns normal session fields without `replanned`. Other changed PATCH requests return normal session fields plus `replanned`; DELETE returns `{ "replanned": ... }` with status 200. `replanned` contains `sessions_created`, `unallocated` (per-assignment minutes/reason) and `remaining_minutes`. Capacity failure preserves the valid edit/deletion, reports the unallocated work, and never invents an overlapping or late allocation. Transaction failure rolls back the edit and replan together.

Summary includes `total`, `completed`, `in_progress`, `overdue_count`, `planned_minutes`, `upcoming`, `overdue`, `sessions`, and `courses`. Upcoming means every incomplete assignment due at or after now; it has no hidden seven-day cutoff. Planned minutes sum all sessions starting at or after now. Course progress uses completed assignment estimates, not measured study activity.

## Overdue scheduling

Overdue means `due_at < now` at generation or editing time. Full generation places incomplete overdue assignments ahead of all incomplete upcoming assignments, regardless of the latter's priority. Within each group, original deadline, priority and stable assignment ID determine order. Overdue sessions may be placed after the original deadline, but must still obey earliest starts, busy-time exclusions, capacity and the planning horizon. Overdue status and the original deadline remain unchanged by planning. An exact deadline equal to now is not yet overdue and has no remaining future capacity. Conflict repair applies the same rule to displaced work while preserving other sessions.

## Personal busy time

`GET /calendar-events?start=<timestamp>&end=<timestamp>` expands the current user's busy rules into occurrences overlapping the requested range. Both timestamps require timezones; the range must be positive and at most 32 days. Response: `{ "events": [{ "id", "busy_time_id", "title", "kind", "starts_at", "ends_at" }] }`. Occurrences retain original bounds (including overnight starts before the range) so the UI can split them at local midnight. Rule IDs link back to the existing busy-time editor. Recurrence expansion uses the same timezone/DST logic as scheduling; different overlapping rules remain separate visual events.

`GET/POST /busy-times` lists or creates owner-scoped rules. `GET/PATCH/DELETE /busy-times/{id}` reads, edits, or deletes one rule; foreign IDs return 404. Mutations require CSRF and the same owner lock as scheduling. Optional `name` defaults to empty (maximum 120 characters). `kind` is `once` (default) or `weekly`; `timezone` is a valid IANA identifier (default UTC).

- `once`: requires timezone-qualified `starts_at` and `ends_at`, with end strictly after start. The UI displays local dates and supports overnight or multi-day arrangements.
- `weekly`: requires `weekdays` (one or more integers 0=Monday through 6=Sunday), `start_time` and `end_time` (`HH:MM`). Equal times are rejected. An end earlier than start means the following day, relative to the selected start weekday. Unused fields are cleared on mode changes. Weekly clock times use the rule's saved timezone.

Busy intervals use half-open bounds: touching a boundary is allowed, any actual overlap is excluded. Overlapping rules are merged for generation. Repeated DST hours are conservatively covered from the first start occurrence to the last end occurrence; nonexistent clock boundaries move forward by the DST gap. Manual session PATCH also rejects busy-time overlaps with a `starts_at` field error.

`GET /schedule` additionally returns `busy_times`, `conflicts` (IDs of conflicting future sessions) and `active_conflicts` (IDs of already-started, still-active conflicting sessions). Saving or deleting busy rules does not move study sessions. `POST /schedule/repair-conflicts` accepts the same settings as generation. It atomically replaces only conflicting future sessions, preserves all others with their IDs/times/durations, and attempts to reallocate the displaced minutes subject to deadlines, earliest starts, study windows and busy rules. It does not fill unrelated backlog. No-conflict calls are no-ops. Shortfalls appear in the response's `unallocated` with a reason; ordinary schedule GET recalculates remaining work from assignment estimates. Started history is never moved. Full generation also excludes busy time but retains its usual replacement of all future sessions.

## Error contract

```json
{"error":"Check the highlighted fields.","fields":{"estimated_minutes":"Enter a whole number from 1 to 10080."}}
```

| Status | Meaning |
| --- | --- |
| 400 | Missing/malformed JSON or a JSON value that is not an object |
| 401 | No valid authenticated session or invalid credentials |
| 403 | Missing/invalid CSRF token or disallowed Origin |
| 404 | Missing or foreign-owned record |
| 409 | Duplicate account / integrity conflict |
| 413 | Body exceeds 32 KiB |
| 422 | Invalid field, unknown field, scheduling constraint violation |
| 429 | Login limit or AI request cooldown |
| 503 | Database temporarily unavailable or optional AI failure |

Invalid state-changing requests never partially persist. Frontend form values remain in React state when errors are returned. No SQL statement, key, password, stack trace, or provider diagnostic is deliberately exposed through API errors.
