import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";

fs.mkdirSync("../tmp/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:5000");
await page.getByLabel("Email address").fill("demo@studyflow.local");
await page.getByLabel("Password", { exact: true }).fill("StudyFlowDemo2026!");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.getByRole("heading", { name: /Let's make today count/ }).waitFor();
await page.getByRole("link", { name: "Schedule", exact: true }).click();
await page.getByRole("heading", { name: "Schedule", exact: true }).waitFor();
const generate = page.getByRole("button", {
  name: "Generate plan",
  exact: true,
});
if (await generate.isVisible()) {
  await generate.click();
  await page
    .getByRole("button", { name: "Regenerate plan", exact: true })
    .waitFor();
}
const results = {};
for (const name of [
  "Dashboard",
  "Courses",
  "Assignments",
  "Schedule",
  "Progress",
]) {
  await page.getByRole("link", { name, exact: true }).click();
  await page
    .getByRole("heading", {
      name: name === "Dashboard" ? /Let's make today count/ : name,
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: `../tmp/screenshots/${name.toLowerCase()}-desktop.png`,
    fullPage: true,
  });
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  results[name] = report.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
}
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Open navigation" }).click();
await page.getByRole("link", { name: "Dashboard", exact: true }).click();
await page.getByRole("heading", { name: /Let's make today count/ }).waitFor();
await page.screenshot({
  path: "../tmp/screenshots/dashboard-mobile.png",
  fullPage: true,
});
fs.writeFileSync("../tmp/accessibility.json", JSON.stringify(results, null, 2));
console.log(
  JSON.stringify({
    browser: browser.version(),
    violations: Object.fromEntries(
      Object.entries(results).map(([name, rows]) => [
        name,
        rows.map((v) => v.id),
      ]),
    ),
  }),
);
await browser.close();
