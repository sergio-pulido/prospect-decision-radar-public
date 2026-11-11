// Replays a saved run's recorded events through the same reducer. No provider calls.
import type { PipelineEvent, RunRecord } from "../../core/types";

/** Idle gaps longer than this (after speed-up) are shortened so the replay never stalls on stage. */
export const MAX_GAP_MS = 6000;

export interface ReplayHandle {
  cancel: () => void;
  done: Promise<void>;
}

/** `at` is the wall-clock time the event originally happened (run start + t), for the event log. */
export function replayRun(run: RunRecord, speed: number, onEvent: (e: PipelineEvent, at: number) => void): ReplayHandle {
  const start = Date.parse(run.startedAt);
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sleep = (ms: number) => new Promise<void>((res) => { timer = setTimeout(res, ms); });
  const done = (async () => {
    let prev = 0;
    for (const { t, ...e } of run.events ?? []) {
      await sleep(Math.min(Math.max(0, t - prev) / speed, MAX_GAP_MS));
      if (cancelled) return;
      prev = t;
      onEvent(e as PipelineEvent, start + t);
    }
    if (cancelled) return;
    onEvent({ type: "run_finished", runId: run.id, counts: run.counts, file: `runs/${run.id}.json`, notes: run.notes, providers: run.providers }, Date.parse(run.finishedAt));
  })();
  return {
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
    done,
  };
}

/** True only if the file holds at least one real Jev answer (from the stored traces, not env). */
export function usedLiveJev(run: Pick<RunRecord, "results">): boolean {
  return run.results.some((r) => Object.values(r.traces ?? {}).some((t) => t?.engine === "jev"));
}

export function replayLabel(run: Pick<RunRecord, "startedAt" | "providers" | "results">): string {
  const ts = new Date(run.startedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const jev = usedLiveJev(run);
  const research = run.results.some((r) => r.evidence?.mode === "live");
  if (jev && research) return `Replay of live run ${ts}`;
  return `Replay of run ${ts} (decider: ${jev ? "Jev live" : "fixture heuristic, not Jev"}; research: ${research ? "Linkup live" : "fixture"})`;
}
