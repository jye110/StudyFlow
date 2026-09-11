import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001" });

test("change password validates inputs, keeps this device signed in and revokes others", async ({ page, request }, testInfo) => {
  const email = `${testInfo.project.name}-password@example.test`;
  const oldPassword = "original password 123";
  const newPassword = "replacement password 456";
  await page.goto("/");
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  expect((await page.request.post("/api/auth/register", {
    headers: { "X-CSRF-Token": csrf }, data: { name: "Password Student", email, password: oldPassword },
  })).status()).toBe(201);
  const otherCsrf = (await (await request.get("/api/auth/csrf")).json()).csrf_token;
  expect((await request.post("/api/auth/login", {
    headers: { "X-CSRF-Token": otherCsrf }, data: { email, password: oldPassword },
  })).status()).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await page.getByLabel("Current password", { exact: true }).fill(oldPassword);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByLabel("Current password", { exact: true })).toHaveValue("");
  await page.getByLabel("Current password", { exact: true }).fill("wrong password");
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password", { exact: true }).fill("mismatched password");
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByText("Passwords do not match.", { exact: true })).toBeVisible();
  await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByText("Current password is incorrect.", { exact: true })).toBeVisible();
  await page.getByLabel("Current password", { exact: true }).fill(oldPassword);
  await page.screenshot({ path: `../tmp/change-password-mobile-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Password changed.");
  expect((await request.get("/api/auth/me")).status()).toBe(401);
  await page.reload();
  expect((await page.request.get("/api/auth/me")).status()).toBe(200);
  const freshCsrf = (await (await request.get("/api/auth/csrf")).json()).csrf_token;
  for (const [password, status] of [[oldPassword, 401], [newPassword, 200]]) {
    expect((await request.post("/api/auth/login", {
      headers: { "X-CSRF-Token": freshCsrf }, data: { email, password },
    })).status()).toBe(status);
  }
});
