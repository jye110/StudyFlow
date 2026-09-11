import { test, expect } from "@playwright/test";

test("earliest start choices persist and control generated sessions", async ({
  page,
}) => {
  await register(page);
  const csrf = (await (await page.request.get("/api/auth/csrf")).json())
    .csrf_token;
  const headers = { "X-CSRF-Token": csrf };
  await page.request.post("/api/courses", {
    headers,
    data: { name: "Start preferences" },
  });
  await page.reload();
  await navigate(page, "Assignments");
  await page
    .getByRole("button", { name: "Add assignment", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Earliest start", { exact: true })).toHaveValue(
    "now",
  );
  await expect(page.getByLabel("Start date", { exact: true })).toHaveCount(0);
  await page.getByLabel("Assignment title").fill("Work on my own timeline");
  const localDate = (date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  const due = localDate(new Date(Date.now() + 21 * 86400000));
  const custom = localDate(new Date(Date.now() + 14 * 86400000)).slice(0, 10);
  await page.getByLabel("Due date and time").fill(due);
  await page
    .getByLabel("Earliest start", { exact: true })
    .selectOption("custom");
  await page
    .getByRole("button", { name: "Save assignment", exact: true })
    .click();
  await expect(
    page.getByText(
      "Choose a start date. For work not yet overdue, it must be on or before the deadline.",
    ),
  ).toBeVisible();
  await page.getByLabel("Start date", { exact: true }).fill(custom);
  await page
    .getByRole("button", { name: "Save assignment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  const openAssignment = () =>
    page
      .getByRole("button", { name: "Work on my own timeline", exact: true })
      .click();
  await openAssignment();
  await expect(page.getByLabel("Earliest start", { exact: true })).toHaveValue(
    "custom",
  );
  await expect(page.getByLabel("Start date", { exact: true })).toHaveValue(
    custom,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const generate = async () => {
    const response = await page.request.post("/api/schedule/generate", {
      headers,
      data: {
        timezone: "UTC",
        start_hour: 9,
        daily_minutes: 180,
        horizon_days: 60,
      },
    });
    expect(response.ok()).toBeTruthy();
    const plan = await response.json();
    expect(plan.unallocated).toEqual([]);
    expect(plan.sessions).toHaveLength(2);
    return plan.sessions;
  };
  const sessions = await generate();
  expect(new Date(sessions[0].starts_at).getTime()).toBeGreaterThanOrEqual(
    new Date(`${custom}T00:00`).getTime(),
  );
  await openAssignment();
  await page
    .getByLabel("Earliest start", { exact: true })
    .selectOption("week_before");
  await expect(page.getByLabel("Start date", { exact: true })).toHaveCount(0);
  const laterDue = localDate(new Date(Date.now() + 28 * 86400000));
  await page.getByLabel("Due date and time").fill(laterDue);
  await page
    .getByRole("button", { name: "Save assignment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const laterPlan = await generate();
  expect(new Date(laterPlan[0].starts_at).getTime()).toBeGreaterThanOrEqual(
    new Date(laterDue).getTime() - 7 * 86400000,
  );
  await page.reload();
  await openAssignment();
  await expect(page.getByLabel("Earliest start", { exact: true })).toHaveValue(
    "week_before",
  );
  await page.getByLabel("Earliest start", { exact: true }).selectOption("now");
  await page
    .getByRole("button", { name: "Save assignment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const immediate = await generate();
  expect(new Date(immediate[0].starts_at).getTime()).toBeLessThan(
    new Date(`${custom}T00:00`).getTime(),
  );
});

test("62-minute assignment shows a planning prompt until generation, with real failures still reported", async ({
  page,
}) => {
  await register(page);
  const csrf = (await (await page.request.get("/api/auth/csrf")).json())
    .csrf_token;
  const headers = { "X-CSRF-Token": csrf };
  const course = await (
    await page.request.post("/api/courses", {
      headers,
      data: { name: "Minute-boundary course" },
    })
  ).json();
  const assignment = await (
    await page.request.post("/api/assignments", {
      headers,
      data: {
        course_id: course.id,
        title: "A 62-minute assignment",
        // Use a full future day so the evening cutoff cannot split the expected chunks.
        start_mode: "custom",
        start_at: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
        due_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        estimated_minutes: 62,
        priority: "High",
        status: "Not Started",
      },
    })
  ).json();
  await page.reload();
  await navigate(page, "Schedule");
  await page.getByRole("button", { name: "Unscheduled work", exact: true }).click();
  await expect(page.locator(".planning-note summary")).toHaveText(
    "1h 2m ready to schedule",
  );
  await expect(
    page.getByText(/Saving an assignment does not automatically schedule it/),
  ).toBeVisible();
  await expect(page.locator(".capacity-note:not(.planning-note)")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate plan", exact: true })
    .click();
  await expect(page.getByText("3 sessions in your plan")).toBeVisible();
  const plan = await (await page.request.get("/api/schedule")).json();
  expect(plan.sessions.map((s) => s.minutes)).toEqual([30, 30, 2]);
  expect(plan.unallocated).toEqual([]);
  await expect(page.locator(".capacity-note")).toHaveCount(0);
  await page.request.patch(`/api/assignments/${assignment.id}`, {
    headers,
    data: { due_at: new Date(Date.now() - 86400000).toISOString() },
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Regenerate plan", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Regenerate plan", exact: true })
    .click();
  await expect(page.getByText("3 sessions in your plan")).toBeVisible();
  await expect(page.locator(".capacity-note")).toHaveCount(0);
  const overduePlan = await (await page.request.get("/api/schedule")).json();
  expect(overduePlan.sessions.map((s) => s.minutes)).toEqual([30, 30, 2]);
  const blocked = await page.request.post("/api/busy-times", {
    headers,
    data: {
      kind: "once",
      starts_at: new Date(Date.now() - 60000).toISOString(),
      ends_at: new Date(Date.now() + 60 * 86400000).toISOString(),
    },
  });
  expect(blocked.status()).toBe(201);
  await page.reload();
  await page
    .getByRole("button", { name: "Regenerate plan", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Regenerate plan", exact: true })
    .click();
  await expect(page.getByText("Could not fit", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unscheduled work", exact: true }).click();
  await expect(page.locator(".capacity-note:not(.planning-note) summary")).toHaveText("1h 2m could not fit in the last plan");
  await expect(
    page.getByText(/Not enough available study time for overdue work/),
  ).toBeVisible();
});

async function register(page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Your name").fill("Browser Student");
  await page
    .getByLabel("Email address")
    .fill(
      `student-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    );
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser test password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Let's make today count/ }),
  ).toBeVisible();
}

async function navigate(page, name) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: name === "Dashboard" ? /Let's make today count/ : name,
      exact: true,
    }),
  ).toBeVisible();
}

test("student acceptance flow, errors, AI outage, completion, deletion and sign-out", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await register(page);
  await navigate(page, "Courses");
  await page
    .getByRole("button", { name: "Add course", exact: true })
    .first()
    .click();
  await page.getByLabel("Course name").fill("Software Engineering");
  await page.getByLabel("Course code (optional)").fill("CS 2101");
  await page.getByRole("button", { name: "Save course" }).click();
  await expect(
    page.getByRole("heading", { name: "Software Engineering" }),
  ).toBeVisible();
  await navigate(page, "Assignments");
  await page
    .getByRole("button", { name: "Add assignment", exact: true })
    .first()
    .click();
  await page.getByLabel("Estimated time (minutes)").fill("0");
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(
    page.getByText("Enter a whole number from 1 to 10080."),
  ).toBeVisible();
  await expect(
    page.getByLabel("Course", { exact: true }).last(),
  ).not.toHaveValue("");
  await page
    .getByLabel("Assignment title")
    .fill("Prepare course demonstration");
  await page.getByLabel("Estimated time (minutes)").fill("60");
  const due = new Date(Date.now() + 4 * 86400000);
  const local = new Date(due.getTime() - due.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel("Due date and time").fill(local);
  // Keep this flow independent of how much study time is left tonight.
  await page.getByLabel("Earliest start", { exact: true }).selectOption("custom");
  const tomorrow = new Date(new Date().setHours(24, 0, 0, 0));
  await page.getByLabel("Start date", { exact: true }).fill(
    new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10),
  );
  await page
    .getByLabel("Notes (optional)")
    .fill("Keep this note after saving.");
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(
    page.getByRole("button", {
      name: "Prepare course demonstration",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Task breakdown for Prepare course demonstration",
    })
    .click();
  await page.getByRole("button", { name: "Request AI suggestion" }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await navigate(page, "Schedule");
  await page
    .getByRole("button", { name: "Generate plan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Regenerate plan", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2 sessions in your plan")).toBeVisible();
  // The plan may begin next week if this is late on Sunday.
  if (
    !(await page
      .getByRole("button", { name: /Edit session Prepare course/ })
      .count())
  ) {
    await page.getByRole("button", { name: "Next week" }).click();
  }
  await page
    .getByRole("button", { name: /Edit session Prepare course/ })
    .first()
    .click();
  await page.getByLabel("Duration (minutes)").fill("20");
  await page.getByRole("button", { name: "Save session" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Assignments");
  await page
    .getByRole("button", {
      name: "Edit Prepare course demonstration",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Notes (optional)")).toHaveValue(
    "Keep this note after saving.",
  );
  await page
    .getByLabel("Status", { exact: true })
    .last()
    .selectOption("In Progress");
  await page.getByRole("button", { name: "Save assignment" }).click();
  await page
    .getByRole("button", { name: "Complete Prepare course demonstration" })
    .click();
  await expect(
    page.getByText("Completed", { exact: true }).last(),
  ).toBeVisible();
  await navigate(page, "Progress");
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await navigate(page, "Schedule");
  await expect(page.getByText("0 sessions in your plan")).toBeVisible();
  await navigate(page, "Courses");
  await page
    .getByRole("button", { name: "Delete Software Engineering" })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Software Engineering" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete Software Engineering" })
    .click();
  await page
    .getByRole("button", { name: "Delete course", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start with your courses" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("responsive primary pages and safe stored text", async ({ page }) => {
  await register(page);
  await navigate(page, "Courses");
  await page
    .getByRole("button", { name: "Add course", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Course name")
    .fill('<img src=x onerror="window.xssExecuted=true">');
  await page.getByLabel("Course code (optional)").fill("TEST");
  await page.getByRole("button", { name: "Save course" }).click();
  await expect(page.getByRole("heading", { name: /<img/ })).toBeVisible();
  await navigate(page, "Assignments");
  await page
    .getByRole("button", { name: "Add assignment", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Assignment title")
    .fill("<script>window.xssExecuted=true</script> " + "longword".repeat(18));
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Schedule");
  await page
    .getByRole("button", { name: "Generate plan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Regenerate plan", exact: true }),
  ).toBeVisible();
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of [
      "Dashboard",
      "Courses",
      "Assignments",
      "Schedule",
      "Progress",
    ]) {
      await navigate(page, name);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(await page.evaluate(() => !!window.xssExecuted)).toBe(false);
    }
  }
  await navigate(page, "Assignments");
  await page.getByRole("button", { name: /^Edit <script>/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Native dialog must trap focus and Escape must restore it to its trigger.
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.querySelector("dialog").contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("AI review, dismiss and explicit acceptance with a deterministic provider fixture", async ({
  page,
}) => {
  await register(page);
  const csrf = (await (await page.request.get("/api/auth/csrf")).json())
    .csrf_token;
  const headers = { "X-CSRF-Token": csrf };
  const course = await (
    await page.request.post("/api/courses", {
      headers,
      data: { name: "AI test course", code: "AI", color: "#2563eb" },
    })
  ).json();
  const assignment = await (
    await page.request.post("/api/assignments", {
      headers,
      data: {
        course_id: course.id,
        title: "Read the project brief",
        notes: "Read the software project brief and list the functional requirements and open questions.",
        due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        estimated_minutes: 60,
        priority: "High",
        status: "Not Started",
      },
    })
  ).json();
  await page.reload();
  await navigate(page, "Assignments");
  await page.route("**/api/assignments/*/ai-suggestion", (route) =>
    route.fulfill({
      json: {
        source: "AI-generated suggestion",
        saved: false,
        steps: ["Read the brief.", "Outline the work.", "Review the plan."],
      },
    }),
  );
  await page
    .getByRole("button", { name: "Task breakdown for Read the project brief" })
    .click();
  await page.getByRole("button", { name: "Request AI suggestion" }).click();
  await expect(
    page.getByText(/AI-generated suggestion · Review/),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/api/assignments/${assignment.id}`)).json())
      .breakdown,
  ).toBeNull();
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  expect(
    (await (await page.request.get(`/api/assignments/${assignment.id}`)).json())
      .breakdown,
  ).toBeNull();
  await page
    .getByRole("button", { name: "Task breakdown for Read the project brief" })
    .click();
  await page.getByRole("button", { name: "Request AI suggestion" }).click();
  await page.getByRole("button", { name: "Accept breakdown" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Task breakdown for Read the project brief" })
    .click();
  await expect(
    page.getByText("Accepted breakdown", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Read the brief.", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/api/assignments/${assignment.id}`)).json())
      .breakdown,
  ).toEqual(["Read the brief.", "Outline the work.", "Review the plan."]);
});
