import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001" });

test("switching to the demo account clears the previous account's course filter", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Email address", { exact: true }).waitFor();
  let csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  const registration = await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": csrf },
    data: { name: "Filter Student", email: `${testInfo.project.name}-filter@example.test`, password: "correct password 123" },
  });
  expect(registration.status()).toBe(201);
  csrf = (await registration.json()).csrf_token;
  const courseResponse = await page.request.post("/api/courses", {
    headers: { "X-CSRF-Token": csrf }, data: { name: "Previous account course" },
  });
  expect(courseResponse.status()).toBe(201);
  const course = await courseResponse.json();
  await page.reload();
  await page.getByRole("link", { name: "Courses", exact: true }).click();
  await page.getByRole("button", { name: "View assignments", exact: true }).click();
  await expect(page.getByLabel("Course", { exact: true })).toHaveValue(String(course.id));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email address", { exact: true }).fill(`${testInfo.project.name}-demo@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("correct password 123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Let's make today count, Alex/ })).toBeVisible();
  await page.getByRole("link", { name: "Assignments", exact: true }).click();
  await expect(page.locator(".assignment-row")).toHaveCount(10);
  await expect(page.getByLabel("Course", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Demo: confirmed study", exact: true })).toBeVisible();
});
