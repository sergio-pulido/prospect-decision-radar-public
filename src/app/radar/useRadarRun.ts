"use client";

// One run engine for both views (Simple and Pro): same reducer, same stream, same replay.
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { RunSummary } from "../../core/io";
import { applyOverride } from "../../core/override";
import type { PipelineEvent, Profile, ProfileOverride, RunRecord } from "../../core/types";
import { applyEvent, emptyView, funnel, interrupt, type RunView } from "./reducer";
import { isExample } from "./examples";
import { replayLabel, replayRun, type ReplayHandle } from "./replay";
import { readNdjson } from "./stream";

export type Providers = RunRecord["providers"];
export type Discovery = "fixture" | "linkup" | "cala" | "both" | "manual";

type Action = { kind: "event"; e: PipelineEvent; now: number; at: number } | { kind: "reset" } | { kind: "interrupt" };
function reduce(v: RunView, a: Action): RunView {
  if (a.kind === "reset") return emptyView;
  if (a.kind === "interrupt") return interrupt(v);
  return applyEvent(v, a.e, a.now, a.at);
}

export interface Settings {
  profileId: string;
  discovery: Discovery;
  names: string;
  seedJson: string;
  limit: number;
  forceFixtures: boolean;
}

export function useRadarRun() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [keys, setKeys] = useState<Providers | null>(null);
  const [settings, setSettings] = useState<Settings>({ profileId: "", discovery: "both", names: "", seedJson: "", limit: 8, forceFixtures: false });
  const [override, setOverride] = useState<ProfileOverride | undefined>(undefined);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [thresholdOverride, setThresholdOverride] = useState<number | null>(null);
  const [view, dispatch] = useReducer(reduce, emptyView);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [replayId, setReplayId] = useState("");
  const [speed, setSpeed] = useState(3);
  const [replayOf, setReplayOf] = useState("");
  const [replayRecord, setReplayRecord] = useState<RunRecord | null>(null);
  const t0 = useRef(0);
  const replayRef = useRef<ReplayHandle | null>(null);

  useEffect(() => {
    fetch("/api/profiles").then((r) => r.json()).then((d: { profiles: Profile[]; providers: Providers }) => {
      setProfiles(d.profiles);
      setKeys(d.providers);
      setSettings((s) => ({ ...s, profileId: s.profileId || d.profiles[0]?.id || "" }));
    }).catch((e: Error) => setError(e.message));
  }, []);

  function loadRuns() {
    fetch("/api/runs").then((r) => r.json()).then((d: { runs?: RunSummary[] }) => {
      // Saved examples first, then the newest runs.
      const all = (d.runs ?? []).filter((r) => r.replayable);
      const list = [...all.filter((r) => isExample(r.id)), ...all.filter((r) => !isExample(r.id))];
      setRuns(list);
      setReplayId((cur) => cur || list[0]?.id || "");
    }).catch(() => {});
  }
  useEffect(loadRuns, []);

  function begin() {
    replayRef.current?.cancel();
    setError(""); setSel(null);
    dispatch({ kind: "reset" });
    t0.current = performance.now();
  }
  const push = (e: PipelineEvent, at = Date.now()) => dispatch({ kind: "event", e, now: performance.now() - t0.current, at });

  async function replay(id = replayId, sp = speed) {
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
      const d = (await res.json()) as { run?: RunRecord; error?: string };
      if (!res.ok || !d.run) throw new Error(d.error ?? `HTTP ${res.status}`);
      begin();
      setReplayRecord(d.run);
      setReplayOf(`${replayLabel(d.run)} · ${sp}x`);
      replayRef.current = replayRun(d.run, sp, push);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function go(withOverride: ProfileOverride | undefined = undefined) {
    begin();
    setReplayOf(""); setReplayRecord(null);
    try {
      const { profileId, discovery, names, seedJson, limit, forceFixtures } = settings;
      const res = await fetch("/api/run/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, discovery, companyNames: names, seedJson, limit, forceFixtures, override: withOverride }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}`);
      let finished = false;
      await readNdjson(res, (e) => {
        if (e.type === "run_finished") finished = true;
        push(e);
      });
      // The stream closed without run_finished (connection lost): end the run with what arrived.
      if (!finished) dispatch({ kind: "interrupt" });
      loadRuns();
    } catch (e) {
      dispatch({ kind: "interrupt" });
      setError((e as Error).message);
    }
  }

  const profile = profiles.find((p) => p.id === settings.profileId);
  const baseRunProfile = profiles.find((p) => p.id === (view.profile?.id ?? settings.profileId));
  // The run's effective profile includes its run-only edits (from the stream input or the replayed file).
  const runOverride = view.input?.profileOverride ?? replayRecord?.input.profileOverride;
  const runProfile = baseRunProfile ? applyOverride(baseRunProfile, runOverride) : undefined;
  const profileThreshold = view.profile?.reviewThreshold ?? profile?.reviewThreshold ?? 0.55;
  const threshold = thresholdOverride ?? profileThreshold;
  const counts = useMemo(() => funnel(view.rows, threshold), [view.rows, threshold]);

  return {
    profiles, keys, settings, setSettings, override, setOverride, error, sel, setSel,
    thresholdOverride, setThresholdOverride, profileThreshold, threshold, view, counts,
    runs, replayId, setReplayId, speed, setSpeed, replayOf, replay, go,
    profile, runProfile,
    running: view.status === "running",
    idle: view.status === "idle",
  };
}

export type RadarRun = ReturnType<typeof useRadarRun>;
