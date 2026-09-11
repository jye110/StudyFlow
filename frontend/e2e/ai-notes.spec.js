import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:5001" });

test("AI requires Notes and supports clarification, editing and explicit acceptance", async ({ page }, testInfo) => {
  await page.goto("/");
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrf_token;
  const login = await page.request.post("/api/auth/login", {
    headers: { "X-CSRF-Token": csrf },
    data: { email: `${testInfo.project.name}-ai-notes@example.test`, password: "correct password 123" },
  });
  expect(login.status()).toBe(200);
  const headers = { "X-CSRF-Token": (await login.json()).csrf_token };
  const course = (await (await page.request.get("/api/courses")).json())[0];
  const assignment = await (await page.request.post("/api/assignments", {
    headers,
    data: { course_id: course.id, title: "Sorting report", notes: "", estimated_minutes: 60,
      priority: "High", status: "Not Started", due_at: "2026-09-24T09:00:00Z" },
  })).json();
  expect(assignment.id).toBeTruthy();
  await page.reload();
  await page.getByRole("link", { name: "Assignments", exact: true }).click();
  const openAI = () => page.getByRole("button", { name: "Task breakdown for Sorting report", exact: true }).click();
  await openAI();
  await expect(page.getByRole("button", { name: "Request AI suggestion" })).toBeDisabled();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Add the assignment requirements to Notes");
  // The real backend also rejects a caller bypassing the disabled button.
  expect((await page.request.post(`/api/assignments/${assignment.id}/ai-suggestion`, { headers, data: {} })).status()).toBe(422);
  await page.getByRole("button", { name: "Edit notes", exact: true }).click();
  await page.getByLabel("Notes (optional)").fill("do homework");
  await page.getByRole("button", { name: "Save assignment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let calls = 0;
  const steps = ["Implement merge sort and insertion sort.", "Measure both algorithms on random arrays.", "Write the runtime comparison report."];
  // Deterministic provider outcomes; no live provider requests or charges.
  await page.route(`**/api/assignments/${assignment.id}/ai-suggestion`, async (route) => {
    calls++;
    if (calls === 1) {
      await route.fulfill({ status: 422, json: {
        error: "Please add more assignment requirements to Notes. Specify the algorithms and report requirements.",
        fields: { notes: "Specify the algorithms and report requirements." },
      } });
    } else {
      await route.fulfill({ json: { steps, source: "AI-generated suggestion", saved: false } });
    }
  });
  await openAI();
  await expect(page.getByText(/Your assignment title, Notes, estimated time/)).toBeVisible();
  await page.getByRole("button", { name: "Request AI suggestion" }).click();
  await expect(page.getByRole("alert")).toContainText("Specify the algorithms and report requirements");
  await expect(page.getByRole("button", { name: "Accept breakdown" })).toHaveCount(0);
  expect((await (await page.request.get(`/api/assignments/${assignment.id}`)).json()).breakdown).toBeNull();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `../tmp/ai-notes-clarification-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "Edit notes", exact: true }).click();
  await page.getByLabel("Notes (optional)").fill("Compare merge sort and insertion sort on random arrays; submit a runtime analysis report.");
  await page.getByRole("button", { name: "Save assignment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openAI();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Request AI suggestion" }).click();
  await expect(page.getByText(steps[0], { exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/assignments/${assignment.id}`)).json()).breakdown).toBeNull();
  await page.getByRole("button", { name: "Accept breakdown" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await (await page.request.get(`/api/assignments/${assignment.id}`)).json()).breakdown).toEqual(steps);
  expect(calls).toBe(2);
});
