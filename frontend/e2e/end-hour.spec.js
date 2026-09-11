import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001", timezoneId: "UTC" });

test("planning end time persists and stops study before the evening cutoff", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
  await page.goto("/");
  // Finish browser session bootstrap before issuing API authentication requests.
  await page.getByLabel("Email address", { exact: true }).waitFor();
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  const account = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": csrf }, data: {
      name: "Evening Student", email: `${testInfo.project.name}-end-hour@example.test`, password: "correct password 123",
    },
  });
  expect(account.status()).toBe(201);
  const headers = { "X-CSRF-Token": (await account.json()).csrf_token };
  const course = await page.request.post("/api/courses", { headers, data: { name: "Finish on time" } });
  expect((await page.request.post("/api/assignments", { headers, data: {
    course_id: (await course.json()).id, title: "Three hours of study", estimated_minutes: 180,
    due_at: "2026-09-12T23:00:00Z", priority: "High", status: "Not Started",
  } })).status()).toBe(201);
  await page.goto("/#schedule");
  await page.reload();
  const openSettings = () => page.getByRole("button", { name: "Plan settings", exact: true }).click();
  await openSettings();
  await expect(page.getByLabel("Finish studying by", { exact: true })).toHaveValue("22");
  await page.getByLabel("Finish studying by", { exact: true }).selectOption("17");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await openSettings();
  await expect(page.getByLabel("Finish studying by", { exact: true })).toHaveValue("22");
  await page.getByLabel("Start studying at", { exact: true }).selectOption("18");
  await expect(page.getByLabel("Finish studying by", { exact: true }).locator('option[value="18"]')).toBeDisabled();
  await page.getByLabel("Finish studying by", { exact: true }).selectOption("19");
  await page.getByRole("button", { name: "Apply settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Generate plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate plan", exact: true })).toBeVisible();
  const plan = (await (await page.request.get("/api/schedule")).json());
  expect(plan.settings.end_hour).toBe(19);
  expect(plan.unallocated).toEqual([]);
  expect(plan.sessions.map((s) => s.starts_at)).toEqual([
    "2026-09-10T18:00:00Z", "2026-09-10T18:30:00Z",
    "2026-09-11T18:00:00Z", "2026-09-11T18:30:00Z",
    "2026-09-12T18:00:00Z", "2026-09-12T18:30:00Z",
  ]);
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings();
  await expect(page.getByLabel("Finish studying by", { exact: true })).toHaveValue("19");
  await page.screenshot({ path: `../tmp/end-hour-mobile-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
