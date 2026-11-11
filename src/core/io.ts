// File-based profile loading and run persistence (Node only, no framework).
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bucketOf, type Bucket } from "./plain";
import { expandProfile, type ProfileSpec } from "./profile";
import type { Profile, RunRecord } from "./types";

const root = () => process.env.RADAR_ROOT ?? process.cwd();

function assertProfile(p: Profile, file: string): Profile {
  const missing = (["id", "name", "offer", "cities", "sizeRange", "sectors", "gate1", "gate2", "action", "reviewThreshold", "research", "discovery", "draftTemplates", "gate1Drop"] as const)
    .filter((k) => p[k] === undefined);
  if (missing.length) throw new Error(`Profile ${file} is missing: ${missing.join(", ")}`);
  for (const q of [p.gate1, ...p.gate2]) {
    if (!q.options.unknown) throw new Error(`Profile ${file}: question ${q.id} needs an "unknown" option`);
  }
  return p;
}

/** Presets in the order the picker shows them; any other file follows, private ones last. */
export const PRESET_ORDER = ["workspace", "b2b-software-smb", "recruiting-services", "outdoor-advertising-media", "custom"];

async function jsonFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/** Profiles from profiles/*.json, then profiles/private/*.json (gitignored, local only). */
export async function listProfiles(): Promise<Profile[]> {
  const dir = path.join(root(), "profiles");
  const priv = path.join(dir, "private");
  const files = [...(await jsonFiles(dir)), ...(await jsonFiles(priv))];
  const out: Profile[] = [];
  for (const f of files) {
    const raw = JSON.parse(await readFile(f, "utf8")) as Profile | ProfileSpec;
    const p = assertProfile(expandProfile(raw), path.relative(dir, f));
    out.push(f.startsWith(priv + path.sep) ? { ...p, private: true } : p);
  }
  const rank = (p: Profile) => {
    const i = PRESET_ORDER.indexOf(p.id);
    return i >= 0 ? i : PRESET_ORDER.length;
  };
  return [...out].sort((a, b) => rank(a) - rank(b));
}

export async function loadProfile(id: string): Promise<Profile> {
  const p = (await listProfiles()).find((x) => x.id === id);
  if (!p) throw new Error(`Unknown profile: ${id}`);
  return p;
}

export async function readFixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root(), "fixtures", name), "utf8")) as T;
}

export async function saveRun(run: RunRecord): Promise<string> {
  const dir = path.join(root(), "runs");
  await mkdir(dir, { recursive: true });
  if (!RUN_ID.test(run.id) || run.id.includes("..")) throw new Error("Invalid run id");
  const file = path.join(dir, `${run.id}.json`);
  await writeFile(file, JSON.stringify(run, null, 2));
  return path.relative(root(), file);
}

const RUN_ID = /^[A-Za-z0-9._-]+$/;

/** Keyless saved examples shipped in fixtures/ (derived fields only): fixtures/demo-run*.json. */
async function fixtureExamples(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const f of await jsonFiles(path.join(root(), "fixtures"))) {
    if (!/demo-run[^/]*\.json$/.test(f)) continue;
    try {
      const r = JSON.parse(await readFile(f, "utf8")) as RunRecord;
      if (r.id) out.set(r.id, f);
    } catch {
      // not a run file
    }
  }
  return out;
}

/** Loads runs/<id>.json, else a saved example from fixtures/. The id is validated so it can never escape runs/. */
export async function loadRun(id: string): Promise<RunRecord> {
  if (!RUN_ID.test(id) || id.includes("..")) throw new Error("Invalid run id");
  try {
    return JSON.parse(await readFile(path.join(root(), "runs", `${id}.json`), "utf8")) as RunRecord;
  } catch (err) {
    const f = (await fixtureExamples()).get(id);
    if (!f) throw err;
    return JSON.parse(await readFile(f, "utf8")) as RunRecord;
  }
}

export interface RunSummary {
  id: string;
  startedAt: string;
  profileId: string;
  discovery: string;
  providers: RunRecord["providers"];
  counts: RunRecord["counts"];
  /** Companies per Simple column at the run's own threshold (decided companies only). */
  buckets: Record<Bucket, number>;
  replayable: boolean;
}

/** Column counts of a saved run, the same mapping as Simple's step 3. */
export function runBuckets(r: Pick<RunRecord, "results" | "profile">): Record<Bucket, number> {
  const out: Record<Bucket, number> = { call: 0, email: 0, check: 0, later: 0 };
  for (const x of r.results) {
    if (x.stage !== "actioned" && x.stage !== "review") continue;
    out[bucketOf(x.action, r.profile.reviewThreshold)]++;
  }
  return out;
}

/** Saved runs (runs/, then keyless examples from fixtures/ not shadowed by a run), newest first. */
export async function listRuns(): Promise<RunSummary[]> {
  const dir = path.join(root(), "runs");
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json") && !f.startsWith("call-ledger") && f !== "apollo-cache.json").map((f) => path.join(dir, f));
  } catch {
    files = [];
  }
  const ids = new Set(files.map((f) => path.basename(f, ".json")));
  const fixtures = [...(await fixtureExamples()).entries()].filter(([id]) => !ids.has(id));
  const out: RunSummary[] = [];
  for (const [id, f] of [...files.map((f) => [path.basename(f, ".json"), f] as const), ...fixtures]) {
    try {
      const r = JSON.parse(await readFile(f, "utf8")) as RunRecord;
      if (!r.results || !r.profile) continue;
      out.push({
        id,
        startedAt: r.startedAt,
        profileId: r.profile.id,
        discovery: r.input.discovery,
        providers: r.providers,
        counts: r.counts,
        buckets: runBuckets(r),
        replayable: Array.isArray(r.events) && r.events.length > 0,
      });
    } catch {
      // not a run file
    }
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
