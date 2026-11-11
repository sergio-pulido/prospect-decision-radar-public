// Screenshots for docs/screens/ at 1440x900 with Playwright.
// Live:   BASE_URL=http://localhost:3000 pnpm screens [--discovery both] [--limit 8]   (ONE real run: spends calls)
// Replay: BASE_URL=... pnpm screens --replay demo-live --company Kabilio --remove funding_last_12_months
//         (replay + one counterfactual: 2 decision calls, no discovery or research calls)
// Simple: BASE_URL=... pnpm screens --simple   (ONE real run from "Find companies": spends calls)
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const out = arg("out", "docs/screens");

async function openSetup(page: Page) {
  await page.locator("details.setup > summary").click();
}

/** The page lands on Simple; Pro screenshots switch with the toggle. */
async function toPro(page: Page) {
  await page.getByRole("tab", { name: "Pro" }).click();
  await page.waitForTimeout(500);
}

async function simple(page: Page) {
  await page.screenshot({ path: `${out}/s1-who.png` });
  await page.getByRole("button", { name: "Find companies" }).click();
  await page.locator(".s-company").first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(Number(arg("midrun-ms", "6000")));
  await page.screenshot({ path: `${out}/s2-found-live.png` });
  const next = page.getByRole("button", { name: "See what to do →" });
  await next.waitFor({ timeout: 300_000 });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("See what to do"));
    return b && !(b as HTMLButtonElement).disabled;
  }, undefined, { timeout: 300_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/s2-found-done.png` });
  await next.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/s3-todo.png` });
  const draft = page.getByRole("button", { name: "Open draft" }).first();
  if (await draft.count()) await draft.click();
  const why = page.getByRole("button", { name: "Why not sure?" }).first();
  if (await why.count()) await why.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/s3-todo-open.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/s3-todo-390.png`, fullPage: true });
}

/** Simple tour from the saved example (no provider calls): steps 1-3, the draft, and step 3 at 390px. */
async function simpleTour(page: Page) {
  const p = arg("prefix", "");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${p}1-step1.png` });
  await page.getByRole("button", { name: "Use a saved example" }).click();
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("See what to do"));
    return b && !(b as HTMLButtonElement).disabled;
  }, undefined, { timeout: 120_000 });
  await page.waitForTimeout(2500);
  // Zoom the map to one city (if the segmented city switch exists) so the spread pins and names show.
  const city = page.getByRole("tab", { name: arg("city", "São Paulo") });
  if (await city.count()) {
    await city.first().click();
    await page.waitForTimeout(2200);
  }
  await page.screenshot({ path: `${out}/${p}2-step2.png` });
  await page.getByRole("button", { name: /See what to do/ }).click();
  if (process.argv.includes("--flip")) {
    await page.waitForTimeout(160);
    await page.screenshot({ path: `${out}/${p}flip-mid.png` });
  }
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${p}3-step3.png` });
  await page.getByRole("button", { name: /^(Open draft|Draft)$/ }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${p}4-draft.png` });
  await page.keyboard.press("Escape");
  const close = page.getByRole("button", { name: /^(Close draft|Close)$/ }).first();
  if (await close.count()) await close.click().catch(() => {});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  console.log(`scrollWidth at 390: ${await page.evaluate(() => document.documentElement.scrollWidth)}`);
  await page.screenshot({ path: `${out}/${p}5-step3-390.png`, fullPage: true });
}

/** 390px check of step 3 from the saved example (no calls). */
async function simpleExample(page: Page) {
  await page.getByRole("button", { name: "Use a saved example" }).click();
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("See what to do"));
    return b && !(b as HTMLButtonElement).disabled;
  }, undefined, { timeout: 120_000 });
  await page.getByRole("button", { name: "See what to do →" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/s3-todo.png` });
  const company = arg("company", "");
  if (company) {
    // Bridge to Pro for one company: its detail panel (Apollo block, Jev bars).
    await page.locator(".s-action").filter({ hasText: company }).getByRole("button", { name: /See how the AI decided/ }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/pro-detail-${company.toLowerCase()}.png` });
    await page.getByRole("button", { name: "Close detail" }).click(); // the drawer covers the toggle
    await page.getByRole("tab", { name: "Simple" }).click();
    await page.waitForTimeout(800);
  }
  const draft = page.getByRole("button", { name: "Open draft" }).first();
  if (await draft.count()) await draft.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`page scrollWidth at 390px: ${width}`);
  await page.screenshot({ path: `${out}/s3-todo-390.png`, fullPage: true });
}

async function live(page: Page) {
  await toPro(page);
  await page.screenshot({ path: `${out}/1-idle.png` });
  await openSetup(page);
  await page.getByLabel("Discovery").selectOption(arg("discovery", "both"));
  await page.getByLabel("Limit").fill(arg("limit", "8"));
  await openSetup(page); // collapse again
  await page.getByRole("button", { name: "Run live" }).click();
  await page.locator(".tline").first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/2-mid-run.png` });
  await page.getByText("Evidence trail saved to").waitFor({ timeout: 280_000 });
  console.log(await page.getByText("Evidence trail saved to").innerText());
  await page.waitForTimeout(1500);
  await page.locator(".policy").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/3-board-finished.png` });
}

async function replay(page: Page) {
  await toPro(page);
  await page.waitForTimeout(6000); // let the globe load and spin
  await page.screenshot({ path: `${out}/1-idle.png` });
  await openSetup(page);
  await page.getByLabel("Replay a saved run").selectOption(arg("replay", "demo-live"));
  await page.getByLabel("Speed").selectOption(arg("speed", "1"));
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await openSetup(page);
  await page.locator(".tline").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(Number(arg("midrun-ms", "4000")));
  await page.screenshot({ path: `${out}/2-mid-run-replay.png` });
  await page.getByText("Evidence trail saved to").waitFor({ timeout: 300_000 });
  await page.waitForTimeout(3500); // fitBounds to all cities
  await page.screenshot({ path: `${out}/3-board-finished.png` });
  await page.locator(".policy").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/3b-board.png` });
  await page.locator(".card").filter({ hasText: arg("company", "Kabilio") }).first().click();
  await page.getByText(`remove ${arg("remove", "funding_last_12_months")}`).click();
  await page.getByRole("button", { name: /Re-ask/ }).click();
  await page.getByText(/Routing (unchanged|changed)/).waitFor({ timeout: 90_000 });
  await page.locator(".cfout").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/4-detail-counterfactual.png` });
}

await mkdir(out, { recursive: true });
// SwiftShader gives headless Chromium WebGL, so the Mapbox globe renders instead of the radar fallback.
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(arg("dsf", "1")) });
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await (process.argv.includes("--tour") ? simpleTour(page) : process.argv.includes("--simple-example") ? simpleExample(page) : process.argv.includes("--simple") ? simple(page) : process.argv.includes("--replay") ? replay(page) : live(page));
  console.log("screens saved");
} finally {
  await browser.close();
}
