// Load .env.local: tsx is not Next, so nothing else does it (Node >= 21.7).
try {
  process.loadEnvFile(".env.local");
} catch {}

// CLI: pnpm run:cli -- --profile workspace --discovery fixture [--fixtures] [--names "A,B"] [--limit 12]
import { loadProfile, saveRun } from "../src/core/io";
import { runPipeline } from "../src/core/pipeline";
import type { RunInput } from "../src/core/types";
import { buildDeps } from "../src/providers";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const profileId = arg("profile") ?? "workspace";
const discovery = (arg("discovery") ?? "fixture") as RunInput["discovery"];
const names = arg("names")?.split(",").map((s) => s.trim()).filter(Boolean);
const limit = Number(arg("limit") ?? 12);
const forceFixtures = process.argv.includes("--fixtures");

const profile = await loadProfile(profileId);
const { deps, providers } = buildDeps({ forceFixtures });
providers.cala = discovery === "cala" ? deps.discovery.cala.mode : "fixture";
console.log(`profile=${profile.id} discovery=${discovery} providers=${JSON.stringify(providers)}`);
deps.onProgress = (r) =>
  console.log(`  ${r.stage.padEnd(14)} ${r.company.name}${r.finalAction ? ` -> ${r.finalAction}` : ""}${r.error ? ` ERROR ${r.error}` : ""}`);
const run = await runPipeline({ profileId, discovery, companyNames: names, limit }, profile, deps, providers);
const file = await saveRun(run);
console.log(`counts=${JSON.stringify(run.counts)}`);
if (run.notes.length) console.log(`notes=${JSON.stringify(run.notes)}`);
console.log(`saved ${file}`);
