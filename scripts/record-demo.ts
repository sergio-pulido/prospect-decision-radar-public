// Records the demo video from the saved example (replay only: no provider calls), 1920x1080, with lower-third
// captions following DEMO.md. Writes a .webm into --out; encode with ffmpeg (see docs/demo/README.md).
// BASE_URL=http://localhost:3000 pnpm tsx scripts/record-demo.ts --out docs/demo/raw
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const out = arg("out", "docs/demo/raw");
const W = 1920;
const H = 1080;

/** Lower-third caption, outside the app's own DOM tree so it never changes the layout. */
async function caption(page: Page, text: string) {
  await page.evaluate((t) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-caption";
      el.setAttribute("style", [
        "position:fixed", "left:50%", "bottom:56px", "transform:translateX(-50%)", "z-index:2147483647",
        "max-width:1200px", "padding:14px 26px", "border-radius:16px", "background:rgba(29,29,31,0.88)",
        "color:#fff", "font:500 26px/1.35 -apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,sans-serif",
        "letter-spacing:-0.01em", "text-align:center", "box-shadow:0 10px 30px rgba(0,0,0,0.25)",
        "transition:opacity .35s ease", "pointer-events:none",
      ].join(";"));
      document.body.appendChild(el);
    }
    el.style.opacity = t ? "1" : "0";
    if (t) el.textContent = t;
  }, text);
}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

async function smoothScroll(page: Page, y: number, ms = 1200) {
  // A string, not a function: the TS loader would inject helpers that do not exist in the page.
  await page.evaluate(`new Promise((res) => {
    const from = window.scrollY, t0 = performance.now();
    requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - t0) / ${ms});
      window.scrollTo(0, from + (${y} - from) * (0.5 - Math.cos(Math.PI * k) / 2));
      if (k < 1) requestAnimationFrame(step); else res();
    });
  })`);
}

async function main() {
  await mkdir(out, { recursive: true });
  // A real GPU keeps the screencast smooth (software WebGL drops the frames of the step 2 -> 3 card flight).
  const gpu = process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  const browser = await chromium.launch({ args: [...gpu, "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: out, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate(() => localStorage.setItem("radar.mode", "simple"));
  await page.goto(base);
  await page.getByRole("radio").first().waitFor();
  await page.mouse.move(W - 40, H - 40);

  // 0:00 the problem
  await caption(page, "Anyone selling to companies wastes time on the wrong ones.");
  await pause(page, 6000);

  // 0:20 step 1: presets, editable, switch once
  await smoothScroll(page, 430);
  await caption(page, "Step 1 · Pick what you sell. The offer, buyer, cities and buying signals fill in.");
  await pause(page, 3500);
  await page.getByRole("radio", { name: /B2B software/ }).click();
  await caption(page, "Switch presets: everything changes. Edit anything, for this search only.");
  await pause(page, 3500);
  await page.getByRole("radio", { name: /Flexible workspace/ }).click();
  await pause(page, 1500);
  await smoothScroll(page, 900);
  await pause(page, 1500);

  // 0:45 step 2
  await caption(page, "Step 2 · Companies are found, checked, researched with sources and decided.");
  await page.getByRole("button", { name: "Use a saved example" }).click();
  await pause(page, 3000);
  await caption(page, "A saved example: a real search recorded earlier, replayed. One map per city.");
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("See what to do"));
    return b && !(b as HTMLButtonElement).disabled;
  }, undefined, { timeout: 120_000 });
  await pause(page, 1500);
  await caption(page, "The list sorts itself: the most urgent first. Hover a company to find it on the map.");
  for (const row of (await page.locator(".a-row-co").all()).slice(0, 5)) {
    await row.hover();
    await pause(page, 1300);
  }
  await page.mouse.move(W - 40, H - 40);
  await pause(page, 800);

  // 1:20 step 3
  await caption(page, "Step 3 · What to do: call, email, check yourself, or not now.");
  await page.getByRole("button", { name: /See what to do/ }).click();
  await pause(page, 4000);
  await caption(page, "Every card: what to do, how sure the AI is, and the evidence behind it.");
  await pause(page, 4500);
  await page.getByRole("button", { name: "Draft" }).first().click();
  await caption(page, "A draft from the evidence. Nothing is ever sent.");
  await pause(page, 4500);
  await page.getByRole("button", { name: "Close" }).first().click({ timeout: 3000 }).catch(() => page.keyboard.press("Escape"));
  await pause(page, 1200);

  // 1:50 how the AI decided
  await caption(page, "How the AI decided: Jev's probability for every option, and your review threshold.");
  await page.getByRole("button", { name: /How the AI decided/ }).first().click();
  await pause(page, 3500);
  const drawer = page.locator(".d-scroll");
  if (await drawer.count()) {
    await drawer.evaluate((d) => d.scrollTo({ top: d.scrollHeight / 2, behavior: "smooth" }));
    await pause(page, 4500);
    await caption(page, "What-if: remove a piece of evidence and ask again. Evidence can be removed, never invented.");
    await drawer.evaluate((d) => d.scrollTo({ top: d.scrollHeight, behavior: "smooth" }));
    await pause(page, 4500);
  }

  // 2:30 trust
  await caption(page, "Every tick links to its source. Company data only, never people. Every run is an evidence trail.");
  await page.getByRole("button", { name: "Close" }).first().click();
  await pause(page, 1200);
  await caption(page, "Every tick links to its source. Company data only, never people. Every run is an evidence trail.");
  const chip = page.locator(".a-src").first();
  if (await chip.count()) await chip.hover();
  await pause(page, 5000);

  // 2:50 close
  await page.mouse.move(W - 40, H - 40);
  await caption(page, "Prospect Decision Radar · next: a module of Alodai for any B2B team.");
  await pause(page, 5500);
  await caption(page, "");
  await pause(page, 800);
  await ctx.close();
  await browser.close();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
