import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001", timezoneId: "UTC" });

test("calendar sessions show assignment details, Notes, saved steps and current study totals", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
  await page.goto("/");
  // Finish browser session bootstrap before issuing API authentication requests.
  await page.getByLabel("Email address", { exact: true }).waitFor();
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  const login = await page.request.post("/api/auth/login", {
    headers: { "X-CSRF-Token": csrf }, data: {
      email: `${testInfo.project.name}-session-details@example.test`, password: "correct password 123",
    },
  });
  expect(login.status()).toBe(200);
  const headers = { "X-CSRF-Token": (await login.json()).csrf_token };
  const assignment = (await (await page.request.get("/api/assignments")).json())[0];
  const notes = 'Compare two sorting algorithms.\nSubmit a runtime report. <img src=x onerror="window.notesExecuted=true">\n' + "LongReference".repeat(90);
  expect((await page.request.patch(`/api/assignments/${assignment.id}`, { headers, data: { notes } })).status()).toBe(200);
  expect((await page.request.put(`/api/assignments/${assignment.id}/breakdown`, { headers, data: { steps: ["Implement both algorithms.", "Compare their runtime."] } })).status()).toBe(200);
  const original = (await (await page.request.get("/api/schedule")).json()).sessions;
  await page.goto("/#schedule");
  await page.reload();
  const eventAt = (time) => page.locator(".time-event.study").filter({ has: page.locator("time", { hasText: new RegExp(`^${time}$`) }) });
  const info = () => page.getByRole("region", { name: "Assignment information", exact: true });
  const fact = (label) => info().locator(".session-assignment-facts > div").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd");
  await eventAt("09:30").click();
  await expect(page.getByRole("dialog", { name: "Edit session", exact: true })).toBeVisible();
  await expect(info().getByRole("heading", { name: assignment.title, exact: true })).toBeVisible();
  await expect(fact("Course")).toContainText(assignment.course.name);
  await expect(fact("Due")).toContainText("Sep 11");
  await expect(fact("Priority")).toHaveText("High");
  await expect(fact("Assignment status")).toHaveText("Not Started");
  await expect(fact("Remaining study")).toHaveText("1h");
  await expect(fact("Not scheduled")).toHaveText("0 min");
  await expect(fact("Awaiting confirmation")).toHaveText("30 min");
  await expect(info().getByRole("region", { name: "Assignment notes" })).toHaveText(notes);
  expect(await page.evaluate(() => !!window.notesExecuted)).toBeFalsy();
  await info().getByText("Accepted task breakdown", { exact: true }).click();
  await expect(info().getByText("Implement both algorithms.", { exact: true })).toBeVisible();
  await page.getByRole("dialog").screenshot({ path: `../tmp/session-assignment-desktop-${testInfo.project.name}.png` });
  await expect(page.getByLabel("Duration (minutes)")).toHaveValue("30");
  await page.keyboard.press("Escape");
  expect((await (await page.request.get("/api/schedule")).json()).sessions).toEqual(original);
  await eventAt("08:30").click();
  await expect(page.getByRole("dialog", { name: "Review study session", exact: true })).toBeVisible();
  await expect(info()).toBeVisible();
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await eventAt("09:30").click();
  await expect(fact("Remaining study")).toHaveText("30 min");
  await expect(fact("Awaiting confirmation")).toHaveText("0 min");
  await expect(fact("Assignment status")).toHaveText("In Progress");
  await page.keyboard.press("Escape");
  await page.clock.fastForward("45:00");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(400);
  await eventAt("09:30").click();
  await expect(page.getByRole("dialog", { name: "Study session in progress", exact: true })).toBeVisible();
  await expect(info()).toBeVisible();
  await expect(page.getByRole("button", { name: "Completed", exact: true })).toHaveCount(0);
  expect(await page.getByRole("dialog").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBeTruthy();
  await page.getByRole("dialog").screenshot({ path: `../tmp/session-assignment-mobile-${testInfo.project.name}.png` });
  await page.keyboard.press("Escape");
  expect((await page.request.patch(`/api/assignments/${assignment.id}`, { headers, data: { notes: "" } })).status()).toBe(200);
  await page.reload();
  await eventAt("09:30").click();
  await expect(info().getByText("No notes added.", { exact: true })).toBeVisible();
});
