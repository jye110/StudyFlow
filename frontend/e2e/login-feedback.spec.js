import { test, expect } from "@playwright/test";

test("login explains invalid input and credentials, then allows correction", async ({ page, request }) => {
  const email = `login-feedback-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = "correct browser password";
  const csrf = (await (await request.get("/api/auth/csrf")).json()).csrf_token;
  expect((await request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": csrf }, data: { name: "Login Student", email, password },
  })).status()).toBe(201);

  await page.goto("/");
  const emailField = page.getByLabel("Email address", { exact: true });
  const passwordField = page.getByLabel("Password", { exact: true });
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  await submit.click();
  await expect(emailField).toHaveAccessibleDescription("Enter your email address.");
  await expect(passwordField).toHaveAccessibleDescription("Enter your password.");
  await emailField.fill("not-an-email");
  await passwordField.fill("wrong password");
  await submit.click();
  await expect(emailField).toHaveAccessibleDescription("Enter a valid email address, such as name@example.com.");
  for (const address of [`missing-${email}`, email]) {
    await emailField.fill(address);
    const response = page.waitForResponse(r => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
    await submit.click();
    expect((await response).status()).toBe(401);
    await expect(page.getByRole("alert")).toContainText("Email or password is incorrect. Check your email spelling and password capitalization.");
  }
  await passwordField.fill(password);
  await submit.click();
  await expect(page.getByRole("heading", { name: /Let's make today count/ })).toBeVisible();
});
