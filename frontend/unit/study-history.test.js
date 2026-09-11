import { test } from "node:test";
import assert from "node:assert/strict";
import { studyHistory, studyChartScale } from "../src/study-history.js";

process.env.TZ = "America/Los_Angeles";
const date = (...parts) => new Date(...parts);
const session = (start, minutes, outcome = "completed") => ({ starts_at: start.toISOString(), minutes, outcome });

test("seven days includes today and empty dates, excluding unconfirmed and future work", () => {
  const now = date(2026, 8, 10, 12).getTime();
  const result = studyHistory([
    session(date(2026, 8, 10, 8), 45), session(date(2026, 8, 4, 8), 30),
    session(date(2026, 8, 3, 8), 60), session(date(2026, 8, 10, 9), 60, "pending"),
    session(date(2026, 8, 10, 10), 30, "missed"), session(date(2026, 8, 11, 8), 30),
  ], now);
  assert.equal(result.length, 7);
  assert.deepEqual(result.map((bucket) => bucket.minutes), [30, 0, 0, 0, 0, 0, 45]);
});

test("overnight study splits at local midnight and clips the range boundary", () => {
  const now = date(2026, 8, 10, 12).getTime();
  const result = studyHistory([
    session(date(2026, 8, 3, 23, 45), 30), session(date(2026, 8, 9, 23, 30), 60),
  ], now);
  assert.deepEqual(result.map((bucket) => bucket.minutes), [15, 0, 0, 0, 0, 30, 30]);
});

test("30-day calendar weeks preserve totals without including dates outside the range", () => {
  const now = date(2026, 8, 10, 12).getTime();
  const sessions = Array.from({ length: 35 }, (_, i) => session(date(2026, 7, 7 + i, 8), 30));
  const result = studyHistory(sessions, now, 30);
  assert.equal(result[0].start.getDate(), 12);
  assert.equal(result.at(-1).end.getDate(), 11);
  assert.deepEqual(result.map((bucket) => bucket.minutes), [150, 210, 210, 210, 120]);
});

test("DST study counts actual elapsed minutes on the local date", () => {
  const start = new Date("2026-11-01T01:30:00-07:00");
  const result = studyHistory([session(start, 120)], date(2026, 10, 2, 12).getTime());
  assert.equal(result[5].minutes, 120);
  assert.equal(result.reduce((sum, bucket) => sum + bucket.minutes, 0), 120);
});

test("empty and large chart scales have a nonzero limit above every bar", () => {
  for (const value of [0, 1, 75, 240, 8000, 100000]) {
    const scale = studyChartScale(value);
    assert.ok(scale.maximum > 0 && scale.maximum >= value);
    assert.equal(scale.ticks.length, 5);
  }
});
