import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001", timezoneId: "UTC" });

test("study history switches daily and weekly totals and reflects check-in corrections", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
  await page.goto("/");
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  const login = await page.request.post("/api/auth/login", {
    headers: { "X-CSRF-Token": csrf }, data: { email: `${testInfo.project.name}-history@example.test`, password: "correct password 123" },
  });
  expect(login.status()).toBe(200);
  const headers = { "X-CSRF-Token": (await login.json()).csrf_token };
  await page.goto("/#progress");
  await page.reload();
  const chart = page.locator(".study-history");
  const bars = chart.locator(".study-history-bar");
  await expect(chart.getByTestId("study-history-total")).toHaveText("2h 30m");
  await expect(bars).toHaveCount(7);
  await chart.getByRole("button", { name: "Wednesday, Sep 9: 1h 15m", exact: true }).click();
  await expect(chart.locator(".study-history-note")).toContainText("1h 15m confirmed study");
  await chart.screenshot({ path: `../tmp/study-history-week-${testInfo.project.name}.png` });
  await chart.getByRole("button", { name: "Last 30 days", exact: true }).click();
  await expect(chart.getByTestId("study-history-total")).toHaveText("7h");
  await expect(bars).toHaveCount(5);
  await expect(bars.nth(0)).toHaveAttribute("aria-label", "Aug 12 – Aug 16: 1h");
  await expect(bars.nth(2)).toHaveAttribute("aria-label", "Aug 24 – Aug 30: 0 min");
  await chart.screenshot({ path: `../tmp/study-history-month-${testInfo.project.name}.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(400);
  await bars.nth(2).focus();
  await page.keyboard.press("Enter");
  await expect(chart.locator(".study-history-note")).toContainText("Aug 24 – Aug 30: 0 min");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await chart.screenshot({ path: `../tmp/study-history-mobile-${testInfo.project.name}.png`, animations: "disabled" });
  const sessions = (await (await page.request.get("/api/schedule")).json()).sessions;
  const pending = sessions.find((session) => session.outcome === "pending");
  expect((await page.request.patch(`/api/sessions/${pending.id}/outcome`, { headers, data: { outcome: "completed" } })).status()).toBe(200);
  await page.reload();
  await expect(chart.getByTestId("study-history-total")).toHaveText("3h");
  for (const session of [...sessions.filter((s) => s.outcome === "completed"), pending]) {
    expect((await page.request.patch(`/api/sessions/${session.id}/outcome`, { headers, data: { outcome: "missed" } })).status()).toBe(200);
  }
  await page.reload();
  await expect(chart.getByTestId("study-history-total")).toHaveText("0 min");
  await expect(chart.getByText(/No confirmed study in this period/)).toBeVisible();
});
