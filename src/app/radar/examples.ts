// Saved examples: replayable runs named example-<preset> (or the older demo-live). Pure.
import type { RunSummary } from "../../core/io";

export const isExample = (id: string): boolean => id.startsWith("example-") || id === "demo-live";

/** The saved example for a preset, else any example. Undefined when none is saved. */
export function exampleFor(runs: ReadonlyArray<Pick<RunSummary, "id" | "profileId" | "replayable">>, profileId: string): string | undefined {
  const ex = runs.filter((r) => r.replayable && isExample(r.id));
  return (ex.find((r) => r.profileId === profileId && r.id.startsWith("example-")) ?? ex.find((r) => r.profileId === profileId) ?? ex[0])?.id;
}

/** Picker line: "★ workspace · call 2 · email 3 · check 1 · not now 2". */
export function exampleLabel(r: Pick<RunSummary, "id" | "profileId" | "buckets">): string {
  const b = r.buckets;
  return `${isExample(r.id) ? "★ " : ""}${r.profileId} · call ${b.call} · email ${b.email} · check ${b.check} · not now ${b.later}`;
}
