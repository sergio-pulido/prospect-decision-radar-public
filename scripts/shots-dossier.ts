// Dossier screenshots from saved examples via deep links (replay only: no provider calls). 1440x900 and 390, 2x.
// BASE_URL=http://localhost:3000 pnpm tsx scripts/shots-dossier.ts --out docs/screens/dossier --call biorce --later bhub
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const out = arg("out", "docs/screens/dossier");
const TABS = ["Why", "Evidence", "Company data", "Sources", "How the AI decided", "Draft"];

async function open(page: Page, company: string, run?: string) {
  await page.goto(`${base}/?company=${company}${run ? `&run=${run}` : ""}`);
  await page.locator(".d-sheet").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(900);
}

async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const call = arg("call", "biorce");
  await open(page, call);
  for (const [i, t] of TABS.entries()) {
    await page.getByRole("tab", { name: t, exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${i + 1}-${call}-${t.toLowerCase().replace(/\s+/g, "-")}.png` });
  }
  const later = arg("later", "bhub");
  await open(page, later);
  await page.screenshot({ path: `${out}/7-${later}-why.png` });
  const extra = arg("extra", "");
  if (extra) {
    const [c, run] = extra.split("@");
    await open(page, c!, run);
    await page.screenshot({ path: `${out}/8-${c}-why.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, call);
  await page.screenshot({ path: `${out}/9-${call}-why-390.png` });
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/10-${call}-evidence-390.png` });
  await browser.close();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
