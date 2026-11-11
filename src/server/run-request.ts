// Parses and validates the run request body shared by /api/run and /api/run/stream.
import { loadProfile } from "../core/io";
import { applyOverride, parseOverride } from "../core/override";
import type { Company, Profile, RunInput, RunRecord } from "../core/types";
import { buildDeps, jevKeyRejected } from "../providers";
import type { PipelineDeps } from "../core/pipeline";

export interface RunBody {
  profileId: string;
  discovery: RunInput["discovery"];
  companyNames?: string;
  seedJson?: string;
  limit?: number;
  forceFixtures?: boolean;
  /** Run-only profile edits from the Simple view. */
  override?: unknown;
}

const DISCOVERY: ReadonlyArray<RunInput["discovery"]> = ["fixture", "cala", "linkup", "both", "manual"];

export interface PreparedRun {
  notes: string[];
  input: RunInput;
  profile: Profile;
  deps: PipelineDeps;
  providers: RunRecord["providers"];
}

export async function prepareRun(raw: unknown, onNote?: (msg: string) => void): Promise<PreparedRun> {
  const body = (raw ?? {}) as Partial<RunBody>;
  if (typeof body.profileId !== "string") throw new Error("profileId is required");
  if (!body.discovery || !DISCOVERY.includes(body.discovery)) throw new Error(`discovery must be one of ${DISCOVERY.join(", ")}`);
  const profileOverride = parseOverride(body.override);
  const profile = applyOverride(await loadProfile(body.profileId), profileOverride);
  let seed: Company[] | undefined;
  if (body.seedJson?.trim()) {
    const parsed = JSON.parse(body.seedJson) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Seed JSON must be an array of companies");
    seed = parsed as Company[];
  }
  const input: RunInput = {
    profileId: profile.id,
    discovery: body.discovery,
    companyNames: body.companyNames?.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
    seed,
    limit: Math.min(Math.max(Number(body.limit) || 12, 1), 30),
    fixturesOnly: body.forceFixtures === true,
    ...(profileOverride ? { profileOverride } : {}),
  };
  const { deps, providers } = buildDeps({ forceFixtures: body.forceFixtures, onNote });
  // Cala only counts as live when it actually ran discovery.
  const usesCala = input.discovery === "cala" || input.discovery === "both";
  const notes = jevKeyRejected() ? ["Jev rejected the API key (HTTP 401/403): the decider runs on the fixture keyword heuristic, not Jev"] : [];
  return { notes, input, profile, deps, providers: { ...providers, cala: usesCala ? deps.discovery.cala.mode : "fixture" } };
}
