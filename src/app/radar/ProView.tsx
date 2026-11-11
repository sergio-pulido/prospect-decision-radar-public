"use client";

import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import type { ProviderMode } from "../../core/types";
import { Board } from "./Board";
import { DiscoveryStrip } from "./DiscoveryStrip";
import { EventLog } from "./EventLog";
import { pct } from "./format";
import { Funnel } from "./Funnel";
import { MapStage } from "./MapStage";
import { Radar } from "./Radar";
import { RunTable } from "./RunTable";
import { Ticker } from "./Ticker";
import { NO_AUTOFILL } from "../simple/ui";
import { exampleLabel, isExample } from "./examples";
import type { Discovery, RadarRun } from "./useRadarRun";

function ModeBadge({ label, mode, decider }: { label: string; mode: ProviderMode; decider?: boolean }) {
  // In fixture mode the decider is a keyword heuristic, never "Jev".
  if (decider) {
    return mode === "live"
      ? <span className="badge jev">Decider: Jev · live</span>
      : <span className="badge fixture">Decider: keyword heuristic · FIXTURE (not Jev)</span>;
  }
  return <span className={`badge ${mode}`}>{label}: {mode === "live" ? "live" : "FIXTURE"}</span>;
}

/** The expert view: map/radar, funnel, event stream, board, detail with Jev bars and what-if. */
export function ProView({ r, toggle, openDossier }: { r: RadarRun; toggle: ReactNode; openDossier: (index: number) => void }) {
  const {
    profiles, keys, settings, setSettings, error, sel, setSel, thresholdOverride, setThresholdOverride,
    profileThreshold, threshold, view, counts, runs, replayId, setReplayId, speed, setSpeed, replayOf,
    replay, go, profile, runProfile, running, idle,
  } = r;
  const { profileId, discovery, names, seedJson, limit, forceFixtures } = settings;
  const [cityFilter, setCityFilter] = useState("All");
  const [showTable, setShowTable] = useState(false);
  const [mapFailed, setMapFailed] = useState("");
  // Selecting a company highlights it and opens its dossier (the same one Simple uses).
  const select = (i: number | null) => {
    setSel(i);
    if (i !== null) openDossier(i);
  };
  const shown = view.providers ?? keys;
  const stageProfile = idle ? profile : runProfile;
  const cities = stageProfile?.cities ?? [];
  const coords = stageProfile?.cityCoordinates ?? {};
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  // Map only with a public token and coordinates for every city; otherwise the SVG radar (offline-safe).
  const useMap = token.startsWith("pk.") && cities.length > 0 && cities.every((c) => coords[c]) && !mapFailed;
  const stage = useMap ? (
    <MapStage
      token={token}
      cities={cities}
      coords={coords}
      rows={view.rows}
      discovery={view.discovery}
      status={view.status}
      threshold={threshold}
      selected={sel}
      onSelect={select}
      onFail={(why) => setMapFailed(why)}
    />
  ) : (
    <Radar cities={cities} rows={view.rows} threshold={threshold} sweeping={idle || running} selected={sel} onSelect={select} />
  );

  const setup = (
    <details className="setup">
      <summary>Setup <span className="muted">· {discovery} discovery · limit {limit}{forceFixtures ? " · FIXTURES ONLY" : ""}</span></summary>
      <div className="bar">
        <label>Preset
          <select value={profileId} onChange={(e) => { setSettings((s) => ({ ...s, profileId: e.target.value })); r.setOverride(undefined); }}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Discovery
          <select value={discovery} onChange={(e) => setSettings((s) => ({ ...s, discovery: e.target.value as Discovery }))}>
            <option value="fixture">Sample companies (fixture)</option>
            <option value="linkup">Linkup search</option>
            <option value="cala">Cala knowledge query</option>
            <option value="both">Both: Linkup + Cala</option>
            <option value="manual">Only my list below</option>
          </select>
        </label>
        <label>Company names (comma or newline)
          <textarea {...NO_AUTOFILL} value={names} onChange={(e) => setSettings((s) => ({ ...s, names: e.target.value }))} placeholder="Optional" />
        </label>
        <label>Seed JSON (array of companies)
          <textarea {...NO_AUTOFILL} value={seedJson} onChange={(e) => setSettings((s) => ({ ...s, seedJson: e.target.value }))} placeholder='[{"name":"…","city":"Barcelona"}]' />
        </label>
        <label>Limit
          <input {...NO_AUTOFILL} type="number" min={1} max={30} value={limit} onChange={(e) => setSettings((s) => ({ ...s, limit: Number(e.target.value) }))} style={{ width: 70 }} />
        </label>
        <label className="inline">
          <input type="checkbox" checked={forceFixtures} onChange={(e) => setSettings((s) => ({ ...s, forceFixtures: e.target.checked }))} /> Fixtures only
        </label>
      </div>
      <div className="bar">
        <label>Replay a saved run (no calls)
          <select value={replayId} onChange={(e) => setReplayId(e.target.value)}>
            {runs.length === 0 && <option value="">No saved runs yet</option>}
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {exampleLabel(r)} · {isExample(r.id) ? r.id : new Date(r.startedAt).toLocaleString("en-GB")} · Jev {r.providers.jev}
              </option>
            ))}
          </select>
        </label>
        <label>Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={1}>1x</option>
            <option value={3}>3x</option>
          </select>
        </label>
        <button className="ghost" onClick={() => replay()} disabled={!replayId || (running && !replayOf)}>Replay</button>
      </div>
    </details>
  );

  return (
    <MotionConfig reducedMotion="user">
      <main>
        <header className="top">
          <div>
            <h1>Prospect Decision Radar</h1>
            <p className="sub">{runProfile?.name ?? "…"} · discover → gate 1 → research → gate 2 → action · nothing is ever sent</p>
          </div>
          {shown && (
            <div className="providers">
              <ModeBadge label="Jev" mode={shown.jev} decider />
              <ModeBadge label="Linkup" mode={shown.linkup} />
              <ModeBadge label="Cala" mode={shown.cala} />
            </div>
          )}
          {toggle}
          {!idle && <button className="primary" onClick={() => go(undefined)} disabled={running || !profileId}>{running && !replayOf ? "Running…" : "Run live"}</button>}
        </header>
        {setup}
        {replayOf && <p className="replaylabel">{replayOf} · recorded data, no provider calls</p>}
        {error && <p className="err">{error}</p>}
        {view.errors.map((m) => <p key={m} className="err">{m}</p>)}
        {view.notes.map((n) => <p key={n} className="note">Note: {n}</p>)}

        <section className={`stage ${idle ? "is-idle" : "is-live"} ${useMap ? "with-map" : "with-radar"}`}>
          <div className="stage-main">
            {stage}
            {idle && (
              <div className="hero-copy">
                <div className="eyebrow">Decision radar</div>
                <h2>{profile?.name ?? "Loading profile…"}</h2>
                <p className="muted">{profile ? `${profile.cities.join(" · ")} · ${profile.sizeRange.min}–${profile.sizeRange.max} employees` : ""}</p>
                <button className="primary huge" onClick={() => go(undefined)} disabled={!profileId}>Run live</button>
                <p className="muted small">{discovery === "both" ? "Linkup + Cala discovery" : `${discovery} discovery`} · limit {limit} · change in Setup</p>
              </div>
            )}
            {useMap && !idle && <span className="map-note">Positions are approximate: city level</span>}
            {mapFailed && <span className="map-note">Map unavailable ({mapFailed}): showing the radar</span>}
          </div>
          {!idle && (
            <div className="panel-funnel">
              <Funnel counts={counts} />
              <Ticker rows={view.rows} running={running} />
            </div>
          )}
          {!idle && <EventLog log={view.log} rows={view.rows} />}
        </section>

        {!idle && (
          <>
            <DiscoveryStrip lines={view.discovery} />
            <div className="policy">
              <label htmlFor="thr"><b>Decision policy</b> · human review below</label>
              <input id="thr" type="range" min={0} max={1} step={0.01} value={threshold} onChange={(e) => setThresholdOverride(Number(e.target.value))} />
              <b className="num big-ish">{pct(threshold)}</b>
              {thresholdOverride !== null && thresholdOverride !== profileThreshold && (
                <button className="link" onClick={() => setThresholdOverride(null)}>reset to profile ({pct(profileThreshold)})</button>
              )}
              <span className="muted small">re-routes from stored probabilities · no new calls</span>
              <button className="ghost right" onClick={() => setShowTable(!showTable)}>{showTable ? "Board" : "Table"}</button>
            </div>
            {view.file && <p className="muted small">Evidence trail saved to <code className="num">{view.file}</code></p>}

            {showTable ? (
              <RunTable rows={view.rows} profile={runProfile} threshold={threshold} cityFilter={cityFilter} setCityFilter={setCityFilter} selected={sel} onSelect={select} />
            ) : (
              <Board profile={runProfile} rows={view.rows} threshold={threshold} selected={sel} onSelect={select} />
            )}
          </>
        )}
      </main>
    </MotionConfig>
  );
}
