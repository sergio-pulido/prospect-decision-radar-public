// Counterfactual re-ask: loads the stored evidence from a saved run, removes the requested fields,
// and re-runs gate 2 + action (2 decision calls). The client cannot send evidence text: no editing.
import { loadProfile, loadRun } from "../../../core/io";
import { applyOverride } from "../../../core/override";
import { redecide } from "../../../core/pipeline";
import { buildDeps } from "../../../providers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  runId: string;
  index: number;
  removed: string[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;
    if (typeof body.runId !== "string" || typeof body.index !== "number" || !Array.isArray(body.removed)) {
      throw new Error("runId, index and removed[] are required");
    }
    if (!body.removed.length) throw new Error("Remove at least one evidence field");
    const run = await loadRun(body.runId);
    const r = run.results[body.index];
    if (!r?.evidence) throw new Error("That company has no research evidence to change");
    // Same profile the run used, including its run-only edits.
    const profile = applyOverride(await loadProfile(run.profile.id), run.input.profileOverride);
    // Same decider as the original run: a fixture run is never compared against live Jev, or vice versa.
    const { deps } = buildDeps({ forceFixtures: run.providers.jev === "fixture" });
    if (run.providers.jev === "live" && deps.decision.mode !== "live") throw new Error("This run used live Jev, but Jev is not available now");
    const out = await redecide(r.company, profile, r.evidence, body.removed.map(String), deps.decision);
    return Response.json({ mode: deps.decision.mode, removed: body.removed, ...out });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
