import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001", timezoneId: "UTC" });

test("seeded demo shows past calendar sessions, check-ins and confirmed study charts", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
  await page.goto("/");
  await page.getByLabel("Email address", { exact: true }).waitFor();
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  const login = await page.request.post("/api/auth/login", {
    headers: { "X-CSRF-Token": csrf },
    data: { email: `${testInfo.project.name}-demo@example.test`, password: "correct password 123" },
  });
  expect(login.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("heading", { name: "1 study sessions need confirmation" })).toBeVisible();
  await page.goto("/#schedule");
  await page.getByRole("button", { name: /Edit session Demo: awaiting confirmation at/ }).click();
  const review = page.getByRole("dialog", { name: "Review study session", exact: true });
  await expect(review).toContainText("Demo: awaiting confirmation");
  await expect(review.getByText("Needs confirmation", { exact: true })).toBeVisible();
  await review.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Study session check-in", exact: true }).click();
  const checkins = page.getByRole("dialog", { name: "Study session check-in", exact: true });
  await expect(checkins).toContainText("1 awaiting confirmation · 1h 30m confirmed study time");
  await checkins.getByText("Reviewed sessions (4)", { exact: true }).click();
  const missed = checkins.locator(".session-checkin-row").filter({ hasText: "Demo: missed study" });
  await expect(missed).toContainText("Not completed");
  await checkins.screenshot({ path: `../tmp/demo-history-checkins-${testInfo.project.name}.png` });
  await checkins.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("/#progress");
  const chart = page.locator(".study-history");
  await expect(chart.getByTestId("study-history-total")).toHaveText("1h 30m");
  await expect(chart.getByRole("button", { name: "Tuesday, Sep 8: 45 min", exact: true })).toBeVisible();
  await chart.getByRole("button", { name: "Last 30 days", exact: true }).click();
  await expect(chart.getByTestId("study-history-total")).toHaveText("1h 30m");
  await page.goto("/#schedule");
  await page.getByRole("button", { name: "Study session check-in", exact: true }).click();
  await checkins.getByRole("button", { name: /Review study session Demo: awaiting confirmation at/ }).click();
  await review.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(checkins).toContainText("0 awaiting confirmation · 2h confirmed study time");
  await checkins.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("/#progress");
  await expect(chart.getByTestId("study-history-total")).toHaveText("2h");
});
