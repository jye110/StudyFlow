import { test, expect } from "@playwright/test";

test("busy time CRUD, conflict repair, repeating exclusions and mobile form", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  // Finish browser session bootstrap before issuing API authentication requests.
  await page.getByLabel("Email address", { exact: true }).waitFor();
  const anonymous = await (await page.request.get("/api/auth/csrf")).json();
  const registration = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": anonymous.csrf_token },
    data: {
      name: "Busy Student",
      email: `busy-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
      password: "busy calendar test password",
    },
  });
  expect(registration.status()).toBe(201);
  const headers = { "X-CSRF-Token": (await registration.json()).csrf_token };
  const course = await (
    await page.request.post("/api/courses", {
      headers,
      data: { name: "Busy calendar course" },
    })
  ).json();
  const local = (value) => {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setHours(0, 0, 0, 0);
  for (const title of ["First study task", "Keep this task in place"]) {
    const response = await page.request.post("/api/assignments", {
      headers,
      data: {
        course_id: course.id,
        title,
        estimated_minutes: 60,
        priority: "High",
        status: "Not Started",
        due_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        start_mode: "custom",
        start_at: tomorrow.toISOString(),
      },
    });
    expect(response.status()).toBe(201);
  }
  const zone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const original = (
    await (
      await page.request.post("/api/schedule/generate", {
        headers,
        data: {
          timezone: zone,
          start_hour: 9,
          end_hour: 22,
          daily_minutes: 180,
          horizon_days: 30,
        },
      })
    ).json()
  ).sessions;
  expect(original).toHaveLength(4);
  await page.goto("/#schedule");
  await page.reload();
  await page.getByRole("button", { name: "Manage busy time", exact: true }).click();
  await page
    .getByRole("button", { name: "Add busy time", exact: true })
    .click();
  await page.getByLabel("Name (optional)").fill("Lunch with friends");
  await page
    .getByLabel("Busy start", { exact: true })
    .fill(local(original[0].starts_at));
  await page
    .getByLabel("Busy end", { exact: true })
    .fill(local(original[0].starts_at));
  await page
    .getByRole("button", { name: "Save busy time", exact: true })
    .click();
  await expect(page.getByText("End must be after start.")).toBeVisible();
  await page
    .getByLabel("Busy end", { exact: true })
    .fill(local(new Date(original[0].starts_at).getTime() + 30 * 60000));
  await page
    .getByRole("button", { name: "Save busy time", exact: true })
    .click();
  await expect(page.locator("dialog:not(.schedule-drawer)")).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Schedule conflicts", exact: true }).click();
  await expect(page.getByText(/1 future sessions need a new time/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Manage busy time", exact: true }).click();
  await expect(
    page.locator(".busy-list").getByText("Lunch with friends", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Schedule conflicts", exact: true }).click();
  await expect(page.getByText(/1 future sessions need a new time/)).toBeVisible();
  await page
    .getByRole("button", {
      name: "Reschedule conflicting sessions",
      exact: true,
    })
    .click();
  await expect(page.locator(".busy-conflicts")).toHaveCount(0);
  const repaired = (await (await page.request.get("/api/schedule")).json())
    .sessions;
  for (const kept of original.slice(1)) expect(repaired).toContainEqual(kept);
  expect(repaired).toHaveLength(4);
  await page.getByRole("button", { name: "Manage busy time", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Edit busy time Lunch with friends",
      exact: true,
    })
    .click();
  await page.getByLabel("Name (optional)").fill("Lunch");
  await page
    .getByRole("button", { name: "Save busy time", exact: true })
    .click();
  await expect(page.locator("dialog:not(.schedule-drawer)")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add busy time", exact: true })
    .click();
  await page.getByLabel("Name (optional)").fill("Work");
  await page.getByLabel("Repeat", { exact: true }).selectOption("weekly");
  await page.getByLabel("Saturday", { exact: true }).check();
  await page.getByLabel("Sunday", { exact: true }).check();
  await page.getByLabel("Busy start time", { exact: true }).fill("09:00");
  // Block the entire study window; daily_minutes is a quota, not its length.
  await page.getByLabel("Busy end time", { exact: true }).fill("22:00");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `../tmp/busy-form-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Save busy time", exact: true })
    .click();
  await expect(page.locator("dialog:not(.schedule-drawer)")).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Regenerate plan", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Regenerate plan", exact: true })
    .click();
  await expect(page.getByText("Could not fit", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unscheduled work", exact: true }).click();
  await expect(
    page.getByText("2h could not fit in the last plan", { exact: true }),
  ).toBeVisible();
  const blocked = await (await page.request.get("/api/schedule")).json();
  expect(blocked.sessions).toEqual([]);
  expect(blocked.unallocated.reduce((sum, item) => sum + item.minutes, 0)).toBe(
    120,
  );
  const weekly = blocked.busy_times.find((rule) => rule.kind === "weekly");
  expect(weekly.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Manage busy time", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete busy time Work", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete busy time?", exact: true })
    .getByRole("button", { name: "Delete busy time", exact: true })
    .click();
  await expect(page.locator("dialog:not(.schedule-drawer)")).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate plan", exact: true })
    .click();
  await expect(page.getByText("4 sessions in your plan")).toBeVisible();
  const final = await (await page.request.get("/api/schedule")).json();
  expect(final.busy_times).toHaveLength(1);
  expect(final.conflicts).toEqual([]);
  expect(final.unallocated).toEqual([]);
  expect(errors).toEqual([]);
});
