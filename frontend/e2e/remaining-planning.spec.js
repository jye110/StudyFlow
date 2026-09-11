import { test, expect } from "@playwright/test";

test("reduce assignment estimate then fill extra work without replacing existing sessions", async ({ page }) => {
  await page.goto("/");
  // Finish browser session bootstrap before issuing API authentication requests.
  await page.getByLabel("Email address", { exact: true }).waitFor();
  const anonymous = await (await page.request.get("/api/auth/csrf")).json();
  const registration = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": anonymous.csrf_token },
    data: {
      name: "Remaining Student",
      email: `remaining-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
      password: "remaining planning password",
    },
  });
  expect(registration.status()).toBe(201);
  const headers = { "X-CSRF-Token": (await registration.json()).csrf_token };
  const course = await (await page.request.post("/api/courses", {
    headers, data: { name: "Remaining course" },
  })).json();
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setHours(0, 0, 0, 0);
  const assignmentData = {
    course_id: course.id,
    title: "Adjust my assignment estimate",
    due_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    estimated_minutes: 90,
    priority: "High",
    status: "Not Started",
    start_mode: "custom",
    start_at: tomorrow.toISOString(),
  };
  await page.request.post("/api/assignments", { headers, data: assignmentData });
  const timezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const original = (await (await page.request.post("/api/schedule/generate", {
    headers, data: { timezone, start_hour: 9, daily_minutes: 180, horizon_days: 30 },
  })).json()).sessions;
  expect(original).toHaveLength(3);
  await page.goto("/#assignments");
  await page.reload();
  async function estimate(minutes) {
    await page.getByRole("button", { name: "Edit Adjust my assignment estimate", exact: true }).click();
    await page.getByLabel("Estimated time (minutes)").fill(String(minutes));
    await page.getByRole("button", { name: "Save assignment", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await estimate(45);
  const trimmed = (await (await page.request.get("/api/schedule")).json()).sessions;
  expect(trimmed).toEqual([original[0], { ...original[1], minutes: 15 }]);
  await estimate(107);
  await page.request.post("/api/assignments", {
    headers, data: { ...assignmentData, title: "New unplanned work", estimated_minutes: 30 },
  });
  await page.goto("/#schedule");
  await page.reload();
  const fill = page.getByRole("button", { name: "Schedule remaining", exact: true });
  await expect(page.getByText(/1h 32m left to schedule/)).toBeVisible();
  expect((await (await page.request.get("/api/schedule")).json()).sessions).toEqual(trimmed);
  await page.getByRole("button", { name: "6h", exact: true }).click();
  await fill.click();
  await expect(page.getByText(/0 min left to schedule/)).toBeVisible();
  await expect(page.getByRole("button", { name: "6h", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(fill).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await (await page.request.get("/api/schedule")).json();
  expect(after.unallocated).toEqual([]);
  expect(after.sessions.slice(0, 2)).toEqual(trimmed);
  expect(after.sessions.reduce((sum, s) => sum + s.minutes, 0)).toBe(137);
  await page.getByRole("button", { name: "Regenerate plan", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Regenerate your study plan?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  expect((await (await page.request.get("/api/schedule")).json()).sessions).toEqual(after.sessions);
  await page.screenshot({ path: "../tmp/remaining-plan-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(fill).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "../tmp/remaining-plan-mobile.png", fullPage: true, animations: "disabled" });
});
