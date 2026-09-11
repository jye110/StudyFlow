import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001", timezoneId: "UTC" });

test("one hour later is the default and newly generated sessions leave a buffer", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
  await page.goto("/");
  // Finish browser session bootstrap before issuing API authentication requests.
  await page.getByLabel("Email address", { exact: true }).waitFor();
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  const account = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": csrf },
    data: { name: "Start Later Student", email: `${testInfo.project.name}-one-hour@example.test`, password: "correct password 123" },
  });
  expect(account.status()).toBe(201);
  const headers = { "X-CSRF-Token": (await account.json()).csrf_token };
  expect((await page.request.post("/api/courses", { headers, data: { name: "Start later" } })).status()).toBe(201);
  await page.goto("/#assignments");
  await page.reload();
  await page.getByRole("button", { name: "Add assignment", exact: true }).first().click();
  await expect(page.getByLabel("Earliest start", { exact: true }).locator("option:checked")).toHaveText("1 hour later");
  await page.getByLabel("Assignment title", { exact: true }).fill("No immediate session");
  await page.getByLabel("Due date and time", { exact: true }).fill("2026-09-11T20:00");
  await page.getByRole("button", { name: "Save assignment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Edit No immediate session", exact: true }).click();
  await expect(page.getByLabel("Earliest start", { exact: true }).locator("option:checked")).toHaveText("1 hour later");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/#schedule");
  await page.getByRole("button", { name: "Generate plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate plan", exact: true })).toBeVisible();
  const sessions = (await (await page.request.get("/api/schedule")).json()).sessions;
  expect(sessions[0].starts_at).toBe("2026-09-10T10:00:00Z");
  expect(sessions.every((s) => s.starts_at >= "2026-09-10T10:00:00Z")).toBe(true);
});
