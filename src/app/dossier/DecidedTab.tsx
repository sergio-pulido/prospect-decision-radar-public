"use client";

import { useState } from "react";
import type { Redecision } from "../../core/pipeline";
import { actionName } from "../../core/plain";
import { signalById } from "../../core/signals";
import type { Answer, CompanyResult, DecisionQuestion, DecisionStep, DecisionTrace, Profile } from "../../core/types";
import { ProbBars, Section, secs } from "./parts";
import type { WhatIfResult } from "./types";

interface Props {
  r: CompanyResult;
  index: number;
  runId?: string;
  profile: Profile;
  threshold: number;
  onWhatIf: (w: WhatIfResult) => void;
}

function engineOf(t?: DecisionTrace): string {
  if (!t) return "not run";
  if (t.engine !== "jev") return "keyword heuristic, not Jev (fixture)";
  return `${t.model ?? "Jev"} via ${t.route === "typesafe-direct" ? "TypeSafe" : "OpenRouter"}`;
}

function StepBlock({ title, step, trace, items }: { title: string; step: DecisionStep; trace?: DecisionTrace; items: Array<{ q?: DecisionQuestion; a: Answer }> }) {
  const [open, setOpen] = useState(false);
  const cost = trace?.usage?.cost;
  return (
    <Section title={title}>
      <p className="d-engine">
        <b>{engineOf(trace)}</b>
        {trace ? ` · ${secs(trace.ms)}` : ""}
        {typeof cost === "number" ? ` · $${cost.toFixed(6)}` : ""}
        {trace?.usage?.input_tokens ? ` · ${trace.usage.input_tokens} tokens in` : ""}
      </p>
      {items.map(({ q, a }) => (
        <div key={a.questionId} className="d-q">
          <p className="d-q-text">{q?.instructions ?? a.question}</p>
          <ProbBars answer={a} question={q} describe />
        </div>
      ))}
      {trace && (
        <div className="d-saw">
          <button className="a-textlink" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} what {trace.engine === "jev" ? "Jev" : "the heuristic"} saw · {step}</button>
          {open && (trace.omitted || !trace.state ? <p className="d-quiet">Not included in this saved example: only the answers, the model, latency and cost are kept.</p> : <pre className="d-mono">{trace.state}</pre>)}
        </div>
      )}
    </Section>
  );
}

/** "What if": remove evidence, re-ask gate 2 and the action (2 decision calls), compare. Only removal is possible. */
function WhatIf({ r, index, runId, profile, threshold, onWhatIf }: Props) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [after, setAfter] = useState<{ result: Redecision; mode: "live" | "fixture" } | null>(null);
  const ev = r.evidence;
  if (!ev || !r.action) return null;
  const present = profile.research.fields.filter((f) => ev.fields[f.id]);
  const label = (id: string) => profile.gate2.find((q) => q.evidenceField === id)?.id;
  const nice = (id: string) => signalById(label(id) ?? "")?.label ?? id.replace(/_/g, " ");
  async function ask() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, index, removed }) });
      const d = (await res.json()) as { result: Redecision; mode: "live" | "fixture"; error?: string };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setAfter(d);
      const a = d.result.action;
      onWhatIf({
        removedLabels: removed.map(nice),
        beforeLabel: actionName(r.action!.choice, profile.actionLabels),
        beforePct: Math.round(r.action!.probability * 100),
        afterLabel: d.result.routed === "review" ? "Check yourself" : actionName(a?.choice ?? "", profile.actionLabels),
        afterPct: Math.round((a?.probability ?? 0) * 100),
        mode: d.mode,
      });
    } catch {
      setError("The AI could not be asked right now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="What if?">
      <p className="d-quiet">Remove evidence and ask again (2 decision calls). Evidence can be removed, never invented.</p>
      <div className="d-whatif">
        {present.map((f) => (
          <label key={f.id} className={removed.includes(f.id) ? "on" : ""}>
            <input type="checkbox" checked={removed.includes(f.id)} onChange={() => setRemoved((xs) => (xs.includes(f.id) ? xs.filter((x) => x !== f.id) : [...xs, f.id]))} />
            Remove “{nice(f.id)}”
          </label>
        ))}
      </div>
      <button className="a-btn primary small" onClick={ask} disabled={busy || !removed.length || !runId}>{busy ? "Asking…" : r.traces?.action?.engine === "jev" ? "Ask Jev again" : "Ask again (keyword heuristic)"}</button>
      {error && <p className="a-warn">{error}</p>}
      {after?.result.action && (
        <div className="d-cmp">
          <div><h5>Before</h5><ProbBars answer={r.action} question={profile.action} /></div>
          <div><h5>After {after.mode === "live" ? "(live Jev)" : "(heuristic)"}</h5><ProbBars answer={after.result.action} question={profile.action} /></div>
        </div>
      )}
    </Section>
  );
}

/** How the AI decided: per step the engine, model, latency, cost, every option and the exact input. For the jury. */
export function DecidedTab(props: Props) {
  const { r, profile, threshold } = props;
  const g2 = r.gate2.map((a) => ({ q: profile.gate2.find((x) => x.id === a.questionId), a }));
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  return (
    <div className="d-tab">
      <p className="d-rule">
        Below <b>{pct(threshold)}</b> on its top choice, a company goes to “Check yourself”.
        {r.action ? ` Here the top choice is ${actionName(r.action.choice, profile.actionLabels).toLowerCase()} at ${pct(r.action.probability)}, so it ${r.action.probability < threshold ? "goes to Check yourself" : "stands"}.` : ""}
      </p>
      {r.gate1 && <StepBlock title="1 · Fit (gate 1)" step="gate1" trace={r.traces?.gate1} items={[{ q: profile.gate1, a: r.gate1 }]} />}
      {g2.length > 0 && <StepBlock title={`2 · Signals (gate 2, ${g2.length} questions in one call)`} step="gate2" trace={r.traces?.gate2} items={g2} />}
      {r.action && <StepBlock title="3 · Action" step="action" trace={r.traces?.action} items={[{ q: profile.action, a: r.action }]} />}
      <WhatIf {...props} />
    </div>
  );
}
