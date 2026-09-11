import { test } from "node:test";
import assert from "node:assert/strict";
import { assignmentStudyTotals } from "../src/assignment-study-totals.js";

const instant = Date.parse("2026-09-10T09:00:00Z");
const session = (assignment_id, minutes, outcome, starts_at = "2026-09-10T08:00:00Z") =>
  ({ assignment_id, minutes, outcome, starts_at });

test("completed, missed, unconfirmed and future work stay distinct for each assignment", () => {
  const result = assignmentStudyTotals([{ id: 1, estimated_minutes: 120 }, { id: 2, estimated_minutes: 60 }, { id: 3, estimated_minutes: 45 }], {
    sessions: [session(1, 15, "completed"), session(1, 30, "pending"), session(1, 20, "missed"),
      session(1, 30, "pending", "2026-09-10T09:30:00Z"), session(2, 62, "completed")],
    unallocated: [{ assignment_id: 1, minutes: 45 }],
  }, instant);
  assert.deepEqual(result.get(1), { completed: 15, remaining: 105, awaiting: 30, unscheduled: 45 });
  assert.deepEqual(result.get(2), { completed: 62, remaining: 0, awaiting: 0, unscheduled: 0 });
  assert.deepEqual(result.get(3), { completed: 0, remaining: 45, awaiting: 0, unscheduled: 0 });
});

test("active sessions become awaiting confirmation exactly at the end, including timezone offsets", () => {
  const schedule = {
    sessions: [session(1, 30, "pending", "2026-09-10T01:30:00-07:00")],
    unallocated: [],
  };
  assert.equal(assignmentStudyTotals([{ id: 1 }], schedule, instant - 1).get(1).awaiting, 0);
  assert.equal(assignmentStudyTotals([{ id: 1 }], schedule, instant).get(1).awaiting, 30);
});

test("manual assignment completion does not invent confirmed study or outstanding work", () => {
  const totals = assignmentStudyTotals([{ id: 1, status: "Completed", estimated_minutes: 60 }], {
    sessions: [session(1, 15, "completed"), session(1, 30, "pending"), session(1, 15, "missed")],
    unallocated: [],
  }, instant).get(1);
  assert.deepEqual(totals, { completed: 15, remaining: 0, awaiting: 30, unscheduled: 0 });
});
