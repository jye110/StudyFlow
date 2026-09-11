import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001", timezoneId: "UTC" });

test("calendar and planning actions fit the viewport despite long history and busy lists", async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
  await page.goto("/");
  // Finish browser session bootstrap before issuing API authentication requests.
  await page.getByLabel("Email address", { exact: true }).waitFor();
  const csrf = (await (await page.request.get("/api/auth/csrf")).json())
    .csrf_token;
  const login = await page.request.post("/api/auth/login", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      email: `${testInfo.project.name}-layout@example.test`,
      password: "correct password 123",
    },
  });
  expect(login.status()).toBe(200);
  await page.goto("/#schedule");
  await page.reload();
  const before = await (await page.request.get("/api/schedule")).json();
  await expect(page.getByRole("button", { name: "12h", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Study session check-in", exact: true }),
  ).toContainText("20");
  await expect(
    page.getByRole("button", { name: "Schedule conflicts", exact: true }),
  ).toContainText("1");
  await expect(page.locator(".session-checkin-list, .busy-list")).toHaveCount(
    0,
  );
  for (const size of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () => {
        const calendar = await page.locator(".time-calendar").boundingBox();
        return Math.ceil(calendar.y + calendar.height);
      })
      .toBeLessThanOrEqual(size.height);
    for (const name of ["Schedule remaining", "Regenerate plan"]) {
      const box = await page
        .getByRole("button", { name, exact: true })
        .boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThan(size.height);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    for (const hours of [12, 6, 24, 12]) {
      await page.getByRole("button", { name: `${hours}h`, exact: true }).click();
      await expect.poll(() => page.locator(".time-scroll").evaluate((element) => {
        const height = parseFloat(element.querySelector(".time-week-body").style.getPropertyValue("--hour-height"));
        return (element.clientHeight - element.querySelector(".time-week-head").offsetHeight) / height;
      })).toBeCloseTo(hours, 1);
      await expect.poll(() => page.locator(".time-scroll").evaluate((element) => {
        const height = parseFloat(element.querySelector(".time-week-body").style.getPropertyValue("--hour-height"));
        return element.scrollTop / height;
      })).toBeCloseTo(hours === 24 ? 0 : 8, 1);
      await page.locator('.time-slot[data-day="1"][data-slot="24"]').click();
      await expect(page.getByLabel("Event start", { exact: true })).toHaveValue("2026-09-08T12:00");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Today", exact: true }).click();
    }
    await page.screenshot({
      path: `../tmp/calendar-12h-${size.width}-${testInfo.project.name}.png`,
      animations: "disabled",
    });
  }
  const settingsButton = page.getByRole("button", {
    name: "Plan settings",
    exact: true,
  });
  await settingsButton.click();
  await page.getByLabel("Start studying at").selectOption("18");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(settingsButton).toBeFocused();
  await settingsButton.click();
  await expect(page.getByLabel("Start studying at")).toHaveValue("9");
  await page.getByLabel("Start studying at").selectOption("18");
  await page.getByRole("button", { name: "Apply settings", exact: true }).click();
  await page.getByRole("button", { name: "Keep current plan", exact: true }).click();
  expect(
    (await (await page.request.get("/api/schedule")).json()).sessions,
  ).toEqual(before.sessions);
  await settingsButton.click();
  await expect(page.getByLabel("Start studying at")).toHaveValue("18");
  await page.keyboard.press("Escape");
  const checkinsButton = page.getByRole("button", {
    name: "Study session check-in",
    exact: true,
  });
  await checkinsButton.click();
  await expect(page.locator(".session-checkin-row")).toHaveCount(20);
  const drawer = page.getByRole("dialog", {
    name: "Study session check-in",
    exact: true,
  });
  expect(
    await drawer.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(checkinsButton).toBeFocused();
  await page
    .getByRole("button", { name: "Manage busy time", exact: true })
    .click();
  await expect(page.locator(".busy-list > li")).toHaveCount(20);
  await page
    .getByRole("button", { name: "Add busy time", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Busy time", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Regenerate plan", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Regenerate your study plan?",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await (await page.request.get("/api/schedule")).json()).sessions,
  ).toEqual(before.sessions);
});
