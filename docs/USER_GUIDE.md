# Using StudyFlow

[Back to README](../README.md)

## Assignments and study totals

Search and filter assignments; set deadlines, priority, estimated minutes, notes, and status.

See each assignment's **Remaining study**, **Not scheduled**, and **Awaiting confirmation** minutes. Remaining study subtracts confirmed study from the estimate, never below zero; completed assignments show zero. Dashboard **Up next** shows the same remaining time. Only ended, unconfirmed sessions await confirmation. **Not scheduled** matches Schedule's backlog.

Open assignments with zero remaining study show **Study time reached · Confirm completion** and a **Mark complete** button in Assignments and Up next. Completion remains a student decision; increasing the estimate removes the reminder when more work remains.

## Earliest start and overdue work

In the assignment form, **Earliest start** controls when automatic and manually moved sessions may begin. **1 hour later** gives newly planned sessions at least one hour after each planning request; fill preserves existing sessions, and editing a session's duration can keep its existing start. Previously selected Now uses this same one-hour rule for new scheduling. **One week before deadline** follows deadline edits; if that time has already passed, planning starts from now. **Custom date** starts at local midnight on the selected date. For work not yet overdue it must be on or before the deadline; overdue work may choose a later start. Switching start choices removes only future sessions that are too early; use Schedule remaining to arrange the missing work without moving other sessions. Insufficient capacity remains visible as unallocated time and never causes the planner to start earlier than requested.

Overdue assignments remain schedulable and take precedence over upcoming assignments, including higher-priority upcoming work. Their original deadlines and overdue labels remain visible. For both groups the planner respects earliest starts and busy time; upcoming work must still finish before its deadline. Use Generate/Regenerate to apply this ordering to your plan.

## Planning settings and personal commitments

Generate or regenerate a study plan with overdue work first, choose daily start/end times and a total daily study budget, and adjust future sessions.

**Apply settings** saves planning preferences and checks future sessions against study hours, the daily study total, the planning window and Busy time. After every successful apply, including when there are no conflicts or no settings were changed, a dialog offers **Regenerate plan** or **Keep current plan**. Any conflict reasons are shown in that dialog; existing sessions move only after regeneration is confirmed. Keeping the plan retains the newly saved settings for later scheduling. Canceling the settings editor discards its draft.

On **Schedule → Busy time → Add busy time**, choose **Does not repeat** for dated arrangements or **Every week** for selected weekdays. You can add several intervals per day; names are optional. Repeating intervals use the saved timezone, and an earlier end clock time continues into the next day. **Time each day** is a total study budget: planning skips busy periods and continues looking for free time between the selected start and end times (default end: 22:00). For example, 3 hours from 09:00 with busy time from 10:00 to 12:00 can produce study from 09:00–10:00 and 12:00–14:00. Existing pending/completed study on that local day counts toward the budget, including earlier study; missed sessions do not. Saving busy time flags existing conflicts without moving sessions. Use **Reschedule conflicting sessions** to move only the conflicting future study time while keeping other sessions in place. If it cannot fit, the displaced work is reported as unallocated. Started sessions remain history. Deleting a busy time makes it available for the next planning action.

## Calendar and event details

The calendar shows all 24 hours with dates across the top and time on the left. Study sessions use course colors; personal events are purple and block study time. Click an empty half-hour to open **Add event** with its date/time already filled in, or use the **Add event** button. Repeat options and conflict handling are shared with Busy time. Editing a repeating event changes the full weekly rule. Overlapping events appear side by side; overnight events continue onto the next day. Very short study sessions have a minimum visible height and show their precise duration when opened. On phones, swipe inside the calendar to see other days; the time axis stays visible. Empty slots support arrow-key navigation and Enter to add.

The calendar defaults to a **12h** view starting at 08:00. Switch between **6h / 12h / 24h**; hour heights adapt to the available space. Scroll inside the calendar to reach other hours. Filling or regenerating a plan preserves the selected view.

Clicking a study session also shows its assignment title, course, deadline, priority, status, estimated/remaining study time, unscheduled time, awaiting-confirmation time and Notes. Accepted task breakdowns can be expanded. These details are available for future, active and ended sessions.

Schedule keeps the calendar and **Schedule remaining / Regenerate plan** in the first screen. **Plan settings** opens a dialog; **Check-in**, **Conflicts**, **Busy time**, and the remaining-time total open side panels without lengthening the page.

## Editing sessions and filling remaining work

Inside a personal event's editor, **Delete event** removes that arrangement after confirmation; for weekly events it deletes the whole repeating series. Study-session editors also include **Delete session**.

**Shortening a future study session keeps all other sessions in place.** For a 60-minute assignment planned as 30 + 30, shortening the first session to 20 leaves 20 + 30 scheduled and 10 minutes unscheduled. The assignment estimate stays at 60. Use **Schedule remaining** when you want to arrange the missing time. Moving and shortening together also keeps other sessions in place, and cannot overlap them.

Extending, moving without shortening, or deleting a future session still automatically adjusts later study time using the latest saved plan settings. Earlier sessions and the edited session stay in place; capacity shortfalls appear as unallocated work. The released slot stays free during automatic adjustment; explicit filling or regeneration may use it again. Past/active study sessions remain protected.

Reducing an assignment's **Estimated time** removes excess future study minutes from the latest sessions first: a 90-minute plan of 30 + 30 + 30 becomes 30 + 15 when reduced to 45. Started sessions remain history, even if their total exceeds the new estimate. Increasing the estimate keeps existing sessions and shows additional minutes waiting to be scheduled. On **Schedule**, choose **Schedule remaining** to allocate only those missing minutes (including newly added assignments), preserving all existing sessions. It uses the study settings above and avoids busy times and occupied slots; insufficient capacity stays visible. Explicit fill can reuse gaps released by earlier edits. Use **Regenerate plan** only when you want to replace the entire future plan.

## Confirming study and viewing progress

After a session ends, the dashboard shows a review prompt and Schedule lists it under **Study session check-in**. You can also click the past calendar event. Pending confirmations keep their planned minutes reserved; time passing never marks study as completed. **Not completed** leaves the historical event visible and makes its minutes available to **Schedule remaining**. **Completed** records self-reported study and updates a Not Started assignment to In Progress. Even when every session is done, mark the assignment complete yourself. Reviewed outcomes can be corrected; correcting missed study to completed trims any newly redundant future time. Existing sessions migrate to pending. Progress displays confirmed study minutes separately from completed-assignment estimates.

Progress includes a **Study time** bar chart: **Last 7 days** shows daily totals and **Last 30 days** groups the selected dates into Monday–Sunday weeks. Only confirmed completed sessions count. Dates use the browser timezone, overnight study is split by date, and the first/last week includes only dates in the range. Click a bar for its exact total.

## Changing your password

To change your password, use **Change password** below your name at the bottom of the sidebar (open the navigation menu on phones). Enter your current password, a different new password of 10–128 characters, and its confirmation. The current device stays signed in with a refreshed session; other devices must sign in again.

## AI task breakdowns

Configure the optional API connection using the [README instructions](../README.md#optional-live-ai). Then open **Assignments → Task breakdown → Request AI suggestion**.

Notes are required for AI suggestions, though they remain optional when creating an assignment. Empty or whitespace-only Notes disable the request button and are rejected by the backend before any provider call. Add the specific assignment topic, required work and expected deliverable. The AI assesses whether the title and Notes provide enough information: unclear Notes return a reminder explaining what to add, with an **Edit notes** shortcut, instead of generic study advice. This assessment is performed by the model, not a minimum text-length rule.

Only assignment title, Notes, estimated minutes, and priority are sent when requesting AI; account records, passwords, and sessions are excluded. The request dialog discloses this before sending. Suggestions are marked as AI-generated and become persistent only on acceptance; clarification or failure does not replace an accepted breakdown. The integration follows the [official structured outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs). Automated tests use deterministic provider responses; they verify application behavior rather than guarantee model judgment on every brief.

## Demo history examples

The **Study history examples** course contains five sessions dated relative to when the examples are created:

- **Demo: confirmed study** has three completed sessions of 30, 45 and 15 minutes across the previous three days. Progress shows 90 confirmed minutes in the weekly/monthly charts.
- **Demo: awaiting confirmation** has a past 30-minute session. Open it in Calendar or **Study session check-in**, then choose Completed or Not completed.
- **Demo: missed study** has a past 30-minute session marked Not completed. It appears under Reviewed sessions and contributes no completed study time; missing work can be planned with Schedule remaining.

New demo accounts include these examples. For an existing account, run `flask --app wsgi seed-demo-history` (optionally with `--email YOUR_DEMO_EMAIL`). This adds a separate example course without replacing existing courses, assignments, sessions, settings or the password. Repeating the command leaves the examples and any changes you made to them intact. Sessions retain their original dates as time passes.
