import { test, expect } from "@playwright/test";

test("time calendar adds events from slots, edits repeats and keeps axis visible on mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const anonymous = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": anonymous.csrf_token },
    data: {
      name: "Calendar Student",
      email: `calendar-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
      password: "calendar test password",
    },
  });
  expect(response.status()).toBe(201);
  const headers = { "X-CSRF-Token": (await response.json()).csrf_token };
  await page.goto("/#schedule");
  await page.reload();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(page.getByText("Loading personal events…")).toHaveCount(0);
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
  const local = (value) => {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  const start = new Date(monday);
  start.setHours(12);
  const end = new Date(monday);
  end.setHours(13);
  const slot = page.locator('.time-slot[data-day="0"][data-slot="24"]');
  await slot.click();
  await expect(
    page.getByRole("dialog", { name: "Add event", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Event start", { exact: true })).toHaveValue(
    local(start),
  );
  await page.getByLabel("Name (optional)").fill("Lunch with friends");
  await page.getByLabel("Event end", { exact: true }).fill(local(end));
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const lunch = page.getByRole("button", {
    name: /Edit event Lunch with friends at/,
  });
  await expect(lunch).toHaveCount(1);
  const scale = await page.locator(".time-week-body").evaluate((element) => parseFloat(element.style.getPropertyValue("--hour-height")));
  expect(await lunch.evaluate((element) => parseFloat(element.style.height))).toBeCloseTo(Math.max(18, scale), 1);
  expect(await lunch.evaluate((element) => parseFloat(element.style.top))).toBeCloseTo(12 * scale, 1);
  let rules = await (await page.request.get("/api/busy-times")).json();
  expect(rules).toHaveLength(1);
  expect(rules[0].starts_at).toBe(start.toISOString().replace(".000", ""));
  await lunch.click();
  await expect(
    page.getByRole("dialog", { name: "Edit event", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Repeat", { exact: true }).selectOption("weekly");
  // The repeating editor can select any weekdays; keep this event on Mondays.
  for (const day of [
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ])
    await page.getByLabel(day, { exact: true }).uncheck();
  await page.getByLabel("Monday", { exact: true }).check();
  await page.getByLabel("Busy start time", { exact: true }).fill("12:00");
  await page.getByLabel("Busy end time", { exact: true }).fill("13:00");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(lunch).toHaveCount(1);
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await expect(lunch).toHaveCount(1);
  const keyboardSlot = page.locator('.time-slot[data-day="1"][data-slot="28"]');
  await keyboardSlot.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const tuesday = new Date(monday);
  tuesday.setDate(tuesday.getDate() + 1);
  tuesday.setHours(14, 30);
  await expect(page.getByLabel("Event start", { exact: true })).toHaveValue(
    local(tuesday),
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  rules = await (await page.request.get("/api/busy-times")).json();
  expect(rules).toHaveLength(1);
  const course = await (
    await page.request.post("/api/courses", {
      headers,
      data: { name: "Software Engineering", code: "CS 2101" },
    })
  ).json();
  await page.request.post("/api/assignments", {
    headers,
    data: {
      course_id: course.id,
      title: "Review the project",
      estimated_minutes: 120,
      priority: "High",
      status: "Not Started",
      due_at: new Date(monday.getTime() + 14 * 86400000).toISOString(),
      start_mode: "custom",
      start_at: monday.toISOString(),
    },
  });
  const zone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  await page.request.post("/api/schedule/generate", {
    headers,
    data: {
      timezone: zone,
      start_hour: 9,
      daily_minutes: 180,
      horizon_days: 30,
    },
  });
  const overlapStart = new Date(monday);
  overlapStart.setHours(9, 15);
  const overlapEnd = new Date(monday);
  overlapEnd.setHours(10);
  await page.request.post("/api/busy-times", {
    headers,
    data: {
      name: "Team meeting",
      kind: "once",
      starts_at: overlapStart.toISOString(),
      ends_at: overlapEnd.toISOString(),
    },
  });
  const overnightStart = new Date(monday);
  overnightStart.setDate(overnightStart.getDate() + 3);
  overnightStart.setHours(23, 30);
  const overnightEnd = new Date(overnightStart.getTime() + 2 * 3600000);
  await page.request.post("/api/busy-times", {
    headers,
    data: {
      name: "Late shift",
      kind: "once",
      starts_at: overnightStart.toISOString(),
      ends_at: overnightEnd.toISOString(),
    },
  });
  await page.reload();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Edit event Late shift at/ }),
  ).toHaveCount(2);
  const meeting = page.getByRole("button", {
    name: /Edit event Team meeting at/,
  });
  await expect(meeting).toHaveCount(1);
  const study = page
    .getByRole("button", { name: /Edit session Review the project at/ })
    .first();
  const rectangles = await Promise.all([
    meeting.boundingBox(),
    study.boundingBox(),
  ]);
  expect(rectangles[0].x).toBeGreaterThanOrEqual(
    rectangles[1].x + rectangles[1].width,
  );
  // After the meeting ends, the touching 10:00 and 10:30 sessions use full width.
  const studySessions = page.getByRole("button", { name: /Edit session Review the project at/ });
  await expect(studySessions).toHaveCount(4);
  for (const index of [2, 3]) {
    const geometry = await studySessions.nth(index).evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      dayWidth: element.parentElement.clientWidth,
    }));
    expect(Math.abs(geometry.width - (geometry.dayWidth - 5))).toBeLessThan(1);
  }
  await page.locator(".time-scroll").evaluate((element) => {
    element.scrollTop = 8 * parseFloat(element.querySelector(".time-week-body").style.getPropertyValue("--hour-height"));
  });
  await page.locator(".time-calendar").screenshot({
    path: `../tmp/calendar-desktop-${testInfo.project.name}.png`,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const axis = page.locator(".time-axis");
  const before = await axis.boundingBox();
  await page.locator(".time-scroll").evaluate((element) => {
    element.scrollLeft = 400;
  });
  const after = await axis.boundingBox();
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.locator(".time-calendar").screenshot({
    path: `../tmp/calendar-mobile-${testInfo.project.name}.png`,
    animations: "disabled",
  });
});
