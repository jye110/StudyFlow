import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001", timezoneId: "UTC" });

test("daily study budget skips busy hours and filling preserves the daily limit", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
  await page.goto("/");
  const anonymous = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  const registered = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": anonymous },
    data: { name: "Daily Budget Student", email: `${testInfo.project.name}-budget@example.test`, password: "correct password 123" },
  });
  expect(registered.status()).toBe(201);
  const headers = { "X-CSRF-Token": (await registered.json()).csrf_token };
  const course = await page.request.post("/api/courses", { headers, data: { name: "Study budget" } });
  const work = await page.request.post("/api/assignments", { headers, data: {
    course_id: (await course.json()).id, title: "Study after busy hours", estimated_minutes: 180,
    due_at: "2026-09-12T23:00:00Z", priority: "High", status: "Not Started",
  } });
  const assignment = await work.json();
  expect(work.status()).toBe(201);
  expect((await page.request.post("/api/busy-times", { headers, data: {
    name: "Morning work", kind: "once", starts_at: "2026-09-10T09:00:00Z", ends_at: "2026-09-10T12:00:00Z",
  } })).status()).toBe(201);
  await page.goto("/#schedule");
  await page.reload();
  await page.getByRole("button", { name: "Plan settings", exact: true }).click();
  await expect(page.getByText(/Time each day is your total study budget/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Generate plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate plan", exact: true })).toBeVisible();
  const original = (await (await page.request.get("/api/schedule")).json()).sessions;
  expect(original.reduce((n, s) => n + s.minutes, 0)).toBe(180);
  expect(original[0].starts_at).toBe("2026-09-10T12:00:00Z");
  expect(original.at(-1).starts_at).toBe("2026-09-10T14:30:00Z");
  expect((await page.request.patch(`/api/assignments/${assignment.id}`, { headers, data: { estimated_minutes: 240 } })).status()).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: "Schedule remaining", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unscheduled work", exact: true })).toContainText("0 min");
  const filled = (await (await page.request.get("/api/schedule")).json()).sessions;
  for (const session of original) expect(filled).toContainEqual(session);
  const totals = {};
  for (const s of filled) totals[s.starts_at.slice(0, 10)] = (totals[s.starts_at.slice(0, 10)] || 0) + s.minutes;
  expect(totals).toEqual({ "2026-09-10": 180, "2026-09-11": 60 });
});
