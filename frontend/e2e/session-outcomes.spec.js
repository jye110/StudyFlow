import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001", timezoneId: "UTC" });

test("confirm historical study, fill missed minutes and correct the outcome", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
  await page.goto("/");
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  const login = await page.request.post("/api/auth/login", {
    headers: { "X-CSRF-Token": csrf },
    data: { email: `${testInfo.project.name}-checkin@example.test`, password: "correct password 123" },
  });
  expect(login.status()).toBe(200);
  await page.reload();
  async function expectAssignmentTotals(remaining, unscheduled, awaiting) {
    await page.goto("/#dashboard");
    await expect(page.locator(".next-work .assignment-meta")).toContainText(`${remaining} remaining`);
    await page.goto("/#assignments");
    const totals = page.locator(".assignment-study-totals");
    await expect(totals.locator(".study-total-remaining dd")).toHaveText(remaining);
    await expect(totals.locator(".study-total-unscheduled dd")).toHaveText(unscheduled);
    await expect(totals.locator(".study-total-awaiting dd")).toHaveText(awaiting);
    await expect(page.locator(".assignment-completion-prompt")).toHaveCount(0);
  }
  await expectAssignmentTotals("1h", "0 min", "30 min");
  await page.screenshot({ path: "../tmp/assignment-study-totals-desktop.png", animations: "disabled", fullPage: true });
  await page.goto("/#dashboard");
  await page.getByRole("button", { name: "Review study sessions", exact: true }).click();
  await page.getByRole("button", { name: "Study session check-in", exact: true }).click();
  const original = (await (await page.request.get("/api/schedule")).json()).sessions;
  await expect(page.getByText("1 awaiting confirmation · 0 min confirmed study time")).toBeVisible();
  const openReview = () => page.getByRole("button", { name: /Review study session Confirm my study at/ }).click();
  await openReview();
  const review = page.getByRole("dialog", { name: "Review study session", exact: true });
  await expect(review.getByText("Needs confirmation", { exact: true })).toBeVisible();
  await expect(review.getByRole("button", { name: "Delete session" })).toHaveCount(0);
  await review.getByRole("button", { name: "Not completed", exact: true }).click();
  await expect(review).toHaveCount(0);
  await page.getByRole("dialog", { name: "Study session check-in", exact: true }).getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByText(/30 min left to schedule/)).toBeVisible();
  await expectAssignmentTotals("1h", "30 min", "0 min");
  await page.goto("/#schedule");
  const fill = page.getByRole("button", { name: "Schedule remaining", exact: true });
  await fill.click();
  await expect(page.getByText(/0 min left to schedule/)).toBeVisible();
  let schedule = await (await page.request.get("/api/schedule")).json();
  expect(schedule.sessions).toHaveLength(3);
  expect(schedule.sessions).toContainEqual(original[1]);
  await page.getByRole("button", { name: "Study session check-in", exact: true }).click();
  await page.getByText("Reviewed sessions (1)", { exact: true }).click();
  await openReview();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../tmp/session-outcome-mobile.png", animations: "disabled" });
  await review.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(page.getByText("0 awaiting confirmation · 30 min confirmed study time")).toBeVisible();
  schedule = await (await page.request.get("/api/schedule")).json();
  expect(schedule.unallocated).toEqual([]);
  expect(schedule.sessions.filter((s) => s.outcome === "completed")).toHaveLength(1);
  expect(schedule.sessions.reduce((sum, s) => sum + s.minutes, 0)).toBe(60);
  expect((await (await page.request.get("/api/assignments")).json())[0].status).toBe("In Progress");
  await page.reload();
  await page.getByRole("button", { name: "Study session check-in", exact: true }).click();
  await expect(page.getByText("0 awaiting confirmation · 30 min confirmed study time")).toBeVisible();
  await page.getByRole("dialog", { name: "Study session check-in", exact: true }).getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("/#progress");
  await expect(page.getByText(/of study confirmed completed/)).toContainText("30 min");
  const summary = await (await page.request.get("/api/summary")).json();
  expect(summary.completed).toBe(0);
  await expectAssignmentTotals("30 min", "0 min", "0 min");
  await page.screenshot({ path: "../tmp/assignment-study-totals-mobile.png", animations: "disabled", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  // Reaching the estimate prompts the student but never completes the assignment automatically.
  async function changeEstimate(minutes) {
    await page.getByRole("button", { name: "Edit Confirm my study", exact: true }).click();
    await page.getByLabel("Estimated time (minutes)").fill(String(minutes));
    await page.getByRole("button", { name: "Save assignment", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  const prompt = page.locator(".assignment-completion-prompt");
  await changeEstimate(30);
  await expect(prompt).toContainText("Study time reached · Confirm completion");
  expect((await (await page.request.get("/api/assignments")).json())[0].status).toBe("In Progress");
  await changeEstimate(60);
  await expect(prompt).toHaveCount(0);
  await changeEstimate(30);
  await page.screenshot({ path: "../tmp/completion-prompt-assignments-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.goto("/#dashboard");
  await expect(prompt).toBeVisible();
  await page.screenshot({ path: "../tmp/completion-prompt-dashboard-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await page.goto("/#assignments");
  await page.getByRole("button", { name: "Reopen Confirm my study", exact: true }).click();
  await expect(prompt).toBeVisible();
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await page.reload();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reopen Confirm my study", exact: true })).toBeVisible();
});
