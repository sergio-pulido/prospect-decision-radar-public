// pnpm demo:warm: one live run saved as a normal run file, printed with its Simple column counts,
// call counts and cost. Promote it to a saved example by hand (runs/example-<preset>.json) after review.
// Options: --profile <preset> --discovery both|linkup|cala --limit <n> --cities "A,B" --names "Co1,Co2"
try {
  process.loadEnvFile(".env.local");
} catch {}

import { loadProfile, runBuckets, saveRun } from "../src/core/io";
import { applyOverride } from "../src/core/override";
import { runPipeline } from "../src/core/pipeline";
import type { RunInput } from "../src/core/types";
import { buildDeps } from "../src/providers";
import { readLedger } from "../src/providers/budget";

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const list = (s: string | undefined) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

const base = await loadProfile(arg("profile") ?? "workspace");
const cities = list(arg("cities"));
const profileOverride = cities ? { cities } : undefined;
const profile = applyOverride(base, profileOverride);
const lateNotes: string[] = [];
const { deps, providers } = buildDeps({ onNote: (m) => lateNotes.push(m) });
const discovery = (arg("discovery") ?? "both") as RunInput["discovery"];
const input: RunInput = {
  profileId: profile.id,
  discovery,
  limit: Number(arg("limit") ?? 8),
  companyNames: list(arg("names")),
  ...(profileOverride ? { profileOverride } : {}),
};
const before = readLedger();
console.log(`demo:warm profile=${profile.id} cities=${profile.cities.join("|")} discovery=${discovery} limit=${input.limit} providers=${JSON.stringify(providers)}`);
deps.onEvent = (e) => {
  if (e.type === "discovery_done") console.log(`  discovery ${e.provider} ${e.city ?? ""}: ${e.count} in ${e.ms} ms${e.error ? ` ERROR ${e.error}` : ""}`);
  if (e.type === "company_done") console.log(`  ${e.result.stage.padEnd(14)} ${e.result.company.name}${e.result.finalAction ? ` -> ${e.result.finalAction} ${Math.round((e.result.action?.probability ?? 0) * 100)}%` : ""}${e.result.error ? ` ERROR ${e.result.error}` : ""}`);
};
const t0 = Date.now();
const done = await runPipeline(input, profile, deps, providers);
const run = { ...done, notes: [...new Set([...done.notes, ...lateNotes])] };
const file = await saveRun(run);
const after = readLedger();
const spent = Object.fromEntries((["jev", "linkup", "cala", "apollo", "geocode"] as const).map((k) => [k, after[k] - before[k]]));
console.log(`buckets=${JSON.stringify(runBuckets(run))} counts=${JSON.stringify(run.counts)} providers=${JSON.stringify(run.providers)}`);
if (run.notes.length) console.log(`notes=${JSON.stringify(run.notes)}`);
console.log(`calls this run=${JSON.stringify(spent)} jevCostUSD=${((after.cost.jev ?? 0) - (before.cost.jev ?? 0)).toFixed(6)} wall=${Date.now() - t0} ms`);
console.log(`saved ${file}`);
