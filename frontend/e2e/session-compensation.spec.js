import { test, expect } from "@playwright/test";

test("calendar event deletion and study resize/delete automatically compensate later work", async ({
  page,
}) => {
  await page.goto("/");
  const anonymous = await (await page.request.get("/api/auth/csrf")).json();
  const registration = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": anonymous.csrf_token },
    data: {
      name: "Compensation Student",
      email: `compensation-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
      password: "session compensation password",
    },
  });
  expect(registration.status()).toBe(201);
  const headers = { "X-CSRF-Token": (await registration.json()).csrf_token };
  const course = await (
    await page.request.post("/api/courses", {
      headers,
      data: { name: "Compensation course" },
    })
  ).json();
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setHours(0, 0, 0, 0);
  await page.request.post("/api/assignments", {
    headers,
    data: {
      course_id: course.id,
      title: "Keep my study time balanced",
      due_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      estimated_minutes: 90,
      priority: "High",
      status: "Not Started",
      start_mode: "custom",
      start_at: tomorrow.toISOString(),
    },
  });
  const zone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const settings = {
    timezone: zone,
    start_hour: 9,
    daily_minutes: 180,
    horizon_days: 30,
  };
  const original = (
    await (
      await page.request.post("/api/schedule/generate", {
        headers,
        data: settings,
      })
    ).json()
  ).sessions;
  const busy = await page.request.post("/api/busy-times", {
    headers,
    data: {
      kind: "weekly",
      name: "Removable lunch",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      start_time: "14:00",
      end_time: "15:00",
      timezone: zone,
    },
  });
  expect(busy.status()).toBe(201);
  await page.goto("/#schedule");
  await page.reload();
  const lunch = page
    .getByRole("button", { name: /Edit event Removable lunch at/ })
    .first();
  await lunch.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete event", exact: true })
    .click();
  await expect(
    page.getByText(/This deletes the entire repeating series/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit event", exact: true }),
  ).toBeVisible();
  expect(await (await page.request.get("/api/busy-times")).json()).toHaveLength(
    1,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete event", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete event", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Edit event Removable lunch at/ }),
  ).toHaveCount(0);
  expect(await (await page.request.get("/api/busy-times")).json()).toEqual([]);
  const study = page.getByRole("button", {
    name: /Edit session Keep my study time balanced at/,
  });
  if (!(await study.count()))
    await page.getByRole("button", { name: "Next week", exact: true }).click();
  await study.first().click();
  await page.getByLabel("Duration (minutes)").fill("45");
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let schedule = await (await page.request.get("/api/schedule")).json();
  expect(schedule.sessions.reduce((sum, s) => sum + s.minutes, 0)).toBe(90);
  expect(schedule.sessions.find((s) => s.id === original[0].id).minutes).toBe(
    45,
  );
  expect(schedule.unallocated).toEqual([]);
  await study.first().click();
  await page.getByLabel("Duration (minutes)").fill("15");
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  schedule = await (await page.request.get("/api/schedule")).json();
  expect(schedule.sessions.reduce((sum, s) => sum + s.minutes, 0)).toBe(90);
  expect(schedule.sessions.find((s) => s.id === original[0].id).minutes).toBe(
    15,
  );
  const resume = new Date(original[0].starts_at).getTime() + 45 * 60000;
  expect(
    schedule.sessions
      .filter((s) => s.id !== original[0].id)
      .every((s) => new Date(s.starts_at).getTime() >= resume),
  ).toBeTruthy();
  await study.first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delete study session?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Duration (minutes)")).toHaveValue("15");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  schedule = await (await page.request.get("/api/schedule")).json();
  expect(schedule.sessions.reduce((sum, s) => sum + s.minutes, 0)).toBe(90);
  expect(
    schedule.sessions.every(
      (s) => s.id !== original[0].id && s.starts_at > original[0].starts_at,
    ),
  ).toBeTruthy();
  expect(schedule.settings).toEqual(settings);
  await page.reload();
  expect(
    (await (await page.request.get("/api/schedule")).json()).sessions,
  ).toEqual(schedule.sessions);
});
