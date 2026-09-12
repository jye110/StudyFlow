import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001", timezoneId: "UTC" });

test("Apply settings saves, checks conflicts and regenerates only after confirmation", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
  await page.goto("/");
  // Finish browser session bootstrap before issuing API authentication requests.
  await page.getByLabel("Email address", { exact: true }).waitFor();
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  const login = await page.request.post("/api/auth/login", {
    headers: { "X-CSRF-Token": csrf }, data: {
      email: `${testInfo.project.name}-apply-settings@example.test`, password: "correct password 123",
    },
  });
  expect(login.status()).toBe(200);
  const readPlan = async () => (await (await page.request.get("/api/schedule")).json());
  const before = await readPlan();
  await page.goto("/#schedule");
  await page.reload();
  const settings = () => page.getByRole("button", { name: "Plan settings", exact: true }).click();
  const prompt = page.getByRole("dialog", { name: "Regenerate your study plan?" });
  const apply = () => page.getByRole("button", { name: "Apply settings", exact: true }).click();
  await settings();
  await page.getByLabel("Start studying at").selectOption("10");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await readPlan()).settings).toEqual(before.settings);
  await settings();
  await expect(page.getByLabel("Start studying at")).toHaveValue("9");
  await apply();
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("No conflicts with existing study sessions.");
  expect((await readPlan()).sessions).toEqual(before.sessions);
  await prompt.getByRole("button", { name: "Keep current plan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await readPlan()).settings.start_hour).toBe(9);
  expect((await readPlan()).sessions).toEqual(before.sessions);
  await settings();
  await page.getByLabel("Start studying at").selectOption("10");
  await apply();
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("1 future study sessions conflict");
  await expect(prompt).toContainText("Sessions fall outside your study start/end times.");
  expect((await readPlan()).sessions).toEqual(before.sessions);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(400);
  await prompt.screenshot({ path: `../tmp/apply-settings-mobile-${testInfo.project.name}.png` });
  expect(await prompt.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBeTruthy();
  await prompt.getByRole("button", { name: "Keep current plan" }).click();
  await page.reload();
  expect((await readPlan()).sessions).toEqual(before.sessions);
  await settings();
  await expect(page.getByLabel("Start studying at")).toHaveValue("10");
  await apply();
  await prompt.getByRole("button", { name: "Regenerate plan", exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("Your study plan is ready.");
  const regenerated = await readPlan();
  expect(regenerated.settings.start_hour).toBe(10);
  expect(regenerated.sessions.find((s) => s.starts_at < "2026-09-10T09:00:00Z")).toEqual(before.sessions[0]);
  expect(regenerated.sessions.find((s) => s.starts_at >= "2026-09-10T09:00:00Z").starts_at).toBe("2026-09-10T10:00:00Z");
  await settings();
  await page.getByLabel("Time each day").selectOption("30");
  await apply();
  await expect(prompt).toContainText("Scheduled study exceeds your daily total");
  await page.keyboard.press("Escape");
  expect((await readPlan()).sessions).toEqual(regenerated.sessions);
  expect((await readPlan()).settings.daily_minutes).toBe(30);
  await settings();
  await page.getByLabel("Time each day").selectOption("180");
  await page.getByLabel("Finish studying by").selectOption("23");
  await apply();
  await expect(prompt).toContainText("No conflicts with existing study sessions.");
  expect((await readPlan()).sessions).toEqual(regenerated.sessions);
  await page.keyboard.press("Escape");
  expect((await readPlan()).settings.end_hour).toBe(23);
  expect((await readPlan()).sessions).toEqual(regenerated.sessions);
  await settings();
  await apply();
  await expect(prompt).toContainText("No conflicts with existing study sessions.");
  await prompt.getByRole("button", { name: "Regenerate plan", exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("Your study plan is ready.");
  const withoutConflicts = await readPlan();
  expect(withoutConflicts.settings.end_hour).toBe(23);
  expect(withoutConflicts.sessions[0]).toEqual(before.sessions[0]);
  expect(withoutConflicts.sessions[1].id).not.toBe(regenerated.sessions[1].id);
});
