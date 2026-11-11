// Verification screenshots from a saved example (replay only: no provider calls).
// BASE_URL=http://localhost:3100 pnpm tsx scripts/shots.ts --out <dir> [--preset workspace] [--width 1440]
// Writes 1-step1, 2-step2, 3-step3, 4-draft (at --width) and 5-step3-390 (full page), deviceScaleFactor 2.
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const out = arg("out", "docs/screens/finish");
const width = Number(arg("width", "1440"));
const only = arg("only", "");

async function waitDone(page: Page) {
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("See what to do"));
    return b && !(b as HTMLButtonElement).disabled;
  }, undefined, { timeout: 180_000 });
}

async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate(() => localStorage.setItem("radar.mode", "simple"));
  await page.goto(base);
  await page.getByRole("radio").first().waitFor();
  const preset = arg("preset", "");
  if (preset) await page.getByRole("radio", { name: new RegExp(preset, "i") }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/1-step1.png`, fullPage: true });
  if (only === "1") return void (await browser.close());
  await page.getByRole("button", { name: "Use a saved example" }).click();
  await page.waitForTimeout(Number(arg("mid", "2500")));
  await page.screenshot({ path: `${out}/2a-step2-mid.png` });
  await waitDone(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/2-step2.png` });
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/2b-step2-scrolled.png` });
  await page.mouse.wheel(0, -2000);
  await page.getByRole("button", { name: /See what to do/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/3-step3.png`, fullPage: true });
  const draft = page.getByRole("button", { name: "Draft" }).first();
  if (await draft.count()) {
    await draft.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/4-draft.png` });
    await page.keyboard.press("Escape");
    const close = page.getByRole("button", { name: /close/i }).first();
    if (await close.count()) await close.click().catch(() => {});
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(900);
  // A full page at 2x can exceed Chromium's 16k capture limit: viewport shots down the page instead.
  await page.screenshot({ path: `${out}/5-step3-390.png` });
  await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/5b-step3-390.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Who we found" }).click();
  await page.waitForTimeout(900);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}/6-step2-390.png`, fullPage: true });
  await page.getByRole("button", { name: "What you sell" }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/7-step1-390.png`, fullPage: true });
  await browser.close();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
