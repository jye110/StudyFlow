import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOUR_HEIGHT,
  MIN_EVENT_HEIGHT,
  layoutDayEvents,
  splitDayEvents,
} from "../src/calendar-layout.js";

const day = new Date(2026, 8, 14);
const at = (hour, minute = 0) =>
  new Date(2026, 8, 14, hour, minute).toISOString();
const event = (id, start, end) => ({ id, starts_at: start, ends_at: end });

test("event geometry follows clock time and duration", () => {
  const [item] = layoutDayEvents([event(1, at(9), at(10, 30))], day);
  assert.equal(item.top, HOUR_HEIGHT * 9);
  assert.equal(item.height, HOUR_HEIGHT * 1.5);
  assert.equal(item.columns, 1);
});

test("overlaps are visible side by side, touching events reuse space", () => {
  const result = layoutDayEvents(
    [
      event(1, at(9), at(11)),
      event(2, at(9, 30), at(10)),
      event(3, at(10), at(11)),
      event(4, at(11), at(12)),
    ],
    day,
  );
  assert.equal(result[0].columns, 2);
  assert.equal(result[1].lane, result[2].lane);
  assert.equal(result[3].columns, 1);
  for (const a of result)
    for (const b of result) {
      if (a.id !== b.id && a.top < b.top + b.height && b.top < a.top + a.height)
        assert.notEqual(a.lane, b.lane);
    }
});

test("touching sessions stay full width at fractional viewport scales", () => {
  const events = Array.from({ length: 12 }, (_, i) =>
    event(i, at(9, i * 30), at(9, (i + 1) * 30)),
  );
  for (const hours of [6, 12, 24]) {
    for (let pixels = 216; pixels <= 1200; pixels++) {
      const scale = pixels / hours;
      // Below this scale, minimum clickable heights really do overlap.
      if (scale / 2 < MIN_EVENT_HEIGHT) continue;
      const rows = layoutDayEvents(events, day, scale);
      assert.ok(rows.every((row) => row.columns === 1 && row.lane === 0),
        `touching sessions split at ${pixels}px / ${hours} hours`);
    }
  }
});

test("fractional scales preserve real overlaps and reuse touching lanes", () => {
  const rows = layoutDayEvents([
    event(1, at(9), at(11)),
    event(2, at(9), at(9, 30)),
    event(3, at(9, 30), at(10)),
    event(4, at(11), at(11, 30)),
  ], day, 601 / 12);
  assert.deepEqual(rows.map((row) => row.columns), [2, 2, 2, 1]);
  assert.equal(rows[1].lane, rows[2].lane);
  assert.notEqual(rows[0].lane, rows[1].lane);
});

test("short sessions remain clickable without hiding neighboring sessions", () => {
  const result = layoutDayEvents(
    [event(1, at(9), at(9, 2)), event(2, at(9, 2), at(9, 30))],
    day,
  );
  assert.equal(result[0].height, MIN_EVENT_HEIGHT);
  assert.equal(result[0].columns, 2);
  assert.notEqual(result[0].lane, result[1].lane);
});

test("overnight and multi-day events are split at local midnight", () => {
  const overnight = event(1, at(-1), at(1));
  const [item] = splitDayEvents([overnight], day);
  assert.equal(item.top, 0);
  assert.equal(item.height, HOUR_HEIGHT);
  assert.equal(item.continuesBefore, true);
  const [wholeDay] = splitDayEvents([event(2, at(-1), at(25))], day);
  assert.equal(wholeDay.height, HOUR_HEIGHT * 24);
  assert.equal(wholeDay.continuesAfter, true);
  assert.equal(splitDayEvents([event(3, at(-1), at(0))], day).length, 0);
});

test("last-minute events stay inside the day", () => {
  const [item] = layoutDayEvents([event(1, at(23, 59), at(24))], day);
  assert.equal(item.height, MIN_EVENT_HEIGHT);
  assert.equal(item.top + item.height, HOUR_HEIGHT * 24);
});

test("event times and durations follow each zoom scale", () => {
  for (const scale of [12, 24, 48, 80]) {
    const [item] = layoutDayEvents(
      [event(1, at(9, 30), at(11, 30))],
      day,
      scale,
    );
    assert.equal(item.top, scale * 9.5);
    assert.equal(item.height, scale * 2);
  }
});

test("compressed short sessions retain distinct clickable lanes and stay within midnight", () => {
  for (const scale of [8, 12, 24, 48]) {
    const rows = layoutDayEvents(
      [event(1, at(23, 58), at(23, 59)), event(2, at(23, 59), at(24))],
      day,
      scale,
    );
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].lane, rows[1].lane);
    for (const item of rows) {
      assert.equal(item.height, MIN_EVENT_HEIGHT);
      assert.ok(item.top >= 0);
      assert.ok(item.top + item.height <= 24 * scale);
    }
  }
});

test("overnight clipping uses the selected scale", () => {
  const [first] = splitDayEvents([event(1, at(-1), at(2))], day, 20);
  assert.equal(first.top, 0);
  assert.equal(first.height, 40);
  assert.equal(first.continuesBefore, true);
  const [whole] = splitDayEvents([event(2, at(-1), at(25))], day, 20);
  assert.equal(whole.height, 480);
  assert.equal(whole.continuesAfter, true);
});
