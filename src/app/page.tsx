"use client";

import { useEffect, useRef, useState } from "react";
import { slugOf } from "../core/dossier";
import { Dossier } from "./dossier/Dossier";
import type { TabId, WhatIfResult } from "./dossier/types";
import { exampleFor, isExample } from "./radar/examples";
import { ProView } from "./radar/ProView";
import { useRadarRun } from "./radar/useRadarRun";
import { SimpleView } from "./simple/SimpleView";

type Mode = "simple" | "pro";
const MODE_KEY = "radar.mode";
/** Replay speed for a deep link: the dossier should open in about a second. */
const DEEP_LINK_SPEED = 200;

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="modetoggle" role="tablist" aria-label="View">
      {(["simple", "pro"] as const).map((m) => (
        <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
          {m === "simple" ? "Simple" : "Pro"}
        </button>
      ))}
    </div>
  );
}

/** Keeps ?company=<slug> in the address bar in sync with the open dossier (other params untouched). */
function syncUrl(company: string | null) {
  try {
    const u = new URL(window.location.href);
    if (company) u.searchParams.set("company", company);
    else u.searchParams.delete("company");
    window.history.replaceState(null, "", u.toString());
  } catch {
    // no history API: the dossier still works, without a deep link
  }
}

export default function Page() {
  const r = useRadarRun();
  const [mode, setModeState] = useState<Mode>("simple");
  const [dossier, setDossier] = useState<{ index: number; tab: TabId } | null>(null);
  const [whatIfs, setWhatIfs] = useState<Record<number, WhatIfResult>>({});
  const deepLink = useRef<{ company: string; run?: string; tried: string[] } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === "pro" || saved === "simple") setModeState(saved);
    } catch {
      // storage unavailable: stay on Simple
    }
    const q = new URLSearchParams(window.location.search);
    const company = q.get("company");
    if (company) deepLink.current = { company, run: q.get("run") ?? undefined, tried: [] };
  }, []);

  // Deep link: replay ?run= (or the preset's saved example, then the other examples) until the company is found.
  useEffect(() => {
    const d = deepLink.current;
    if (!d || !r.settings.profileId || !r.runs.length || r.view.status === "running") return;
    const row = r.view.rows.find((x) => slugOf(x.result.company.name) === d.company);
    if (row) {
      deepLink.current = null;
      setDossier({ index: row.index, tab: "why" });
      return;
    }
    const examples = r.runs.filter((x) => isExample(x.id)).map((x) => x.id);
    const order = [d.run, exampleFor(r.runs, r.settings.profileId), ...examples].filter((x): x is string => !!x && r.runs.some((y) => y.id === x));
    const next = order.find((id) => !d.tried.includes(id));
    if (!next) {
      deepLink.current = null; // not in any saved run: the page simply stays open
      return;
    }
    d.tried.push(next);
    void r.replay(next, DEEP_LINK_SPEED);
  }, [r.runs, r.view.rows, r.view.status, r.settings.profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new run clears the open dossier and stored What-ifs.
  useEffect(() => {
    if (r.view.status === "running" && !deepLink.current) {
      setDossier(null);
      setWhatIfs({});
    }
  }, [r.view.status]);

  const setMode = (m: Mode) => {
    setModeState(m);
    window.scrollTo({ top: 0 });
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // storage unavailable: mode lasts for this page only
    }
  };
  const openDossier = (index: number, tab: TabId = "why") => {
    const row = r.view.rows.find((x) => x.index === index);
    setDossier({ index, tab });
    syncUrl(row ? slugOf(row.result.company.name) : null);
  };
  const closeDossier = () => {
    setDossier(null);
    syncUrl(null);
  };
  const toggle = <ModeToggle mode={mode} setMode={setMode} />;
  const done = r.view.status === "finished" || r.view.status === "interrupted";
  return (
    <>
      {mode === "simple" ? <SimpleView r={r} toPro={() => setMode("pro")} openDossier={openDossier} /> : <ProView r={r} toggle={toggle} openDossier={(i) => openDossier(i, "decided")} />}
      <Dossier
        rows={r.view.rows}
        index={dossier?.index ?? null}
        tab={dossier?.tab ?? "why"}
        profile={r.runProfile}
        threshold={r.threshold}
        runId={r.view.runId}
        discovery={r.view.discovery}
        done={done}
        whatIfs={whatIfs}
        onWhatIf={(i, w) => setWhatIfs((x) => ({ ...x, [i]: w }))}
        onOpen={openDossier}
        onTab={(tab) => setDossier((d) => (d ? { ...d, tab } : d))}
        onClose={closeDossier}
      />
    </>
  );
}
