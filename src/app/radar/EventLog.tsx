"use client";

import { useEffect, useRef } from "react";
import type { PipelineEvent } from "../../core/types";
import { pct } from "./format";
import type { LogLine, Row } from "./reducer";

const hhmmss = (ms: number) => new Date(ms).toTimeString().slice(0, 8);
const secs = (ms?: number) => (typeof ms === "number" ? `${(ms / 1000).toFixed(1)}s` : "");

/** [source tag, text] for one event. The tag drives the colour. */
function describe(e: PipelineEvent, name: (i: number) => string): [string, string] | null {
  switch (e.type) {
    case "run_started":
      return ["run", `start ${e.profile.id} discovery=${e.input.discovery} limit=${e.input.limit ?? ""}`];
    case "discovery_query":
      return [e.provider, `query ${e.city ?? ""} "${e.query.slice(0, 60)}${e.query.length > 60 ? "…" : ""}"`];
    case "discovery_done":
      return [e.provider, `found ${e.count} ${e.city ?? ""} ${secs(e.ms)}${e.error ? ` ERROR ${e.error.slice(0, 60)}` : ""}`];
    case "company_discovered":
      return [e.company.discoveredBy, `+ ${e.company.name} ${e.company.city ?? ""}`];
    case "decision_started":
      return [e.engine === "jev" ? "jev" : "heur", `${e.step} ${name(e.index)} asking ${e.questions.length}q`];
    case "gate1":
      return [e.trace?.engine === "jev" ? "jev" : "heur", `gate1 ${name(e.index)} ${e.answer.choice} ${pct(e.answer.probability)} ${secs(e.trace?.ms)}${e.dropped ? " DROP" : ""}`];
    case "enrichment_done": {
      if (e.error) return ["apollo", `enrich ${name(e.index)} ERROR ${e.error.slice(0, 60)}`];
      if (!e.enrichment) return ["apollo", `enrich ${name(e.index)} skipped (no domain)`];
      const en = e.enrichment;
      const tag = en.cached ? "cached" : `${secs(e.ms)}`;
      return [en.mode === "live" ? "apollo" : "fixture", `enrich ${name(e.index)} ${en.matched ? `${en.fields.estimated_num_employees ?? "?"} emp${en.location ? " · exact address" : ""}` : "name mismatch, discarded"} ${tag}`];
    }
    case "research_started":
      return ["linkup", `research ${name(e.index)}`];
    case "research_done": {
      const filled = Object.values(e.evidence.fields).filter(Boolean).length;
      return [e.evidence.mode === "live" ? "linkup" : "fixture", `research ${name(e.index)} ${filled} fields ${e.evidence.sources.length} src ${secs(e.ms)}`];
    }
    case "gate2":
      return [e.trace?.engine === "jev" ? "jev" : "heur", `gate2 ${name(e.index)} ${e.answers.length} answers ${secs(e.trace?.ms)}`];
    case "action":
      return [e.trace?.engine === "jev" ? "jev" : "heur", `action ${name(e.index)} ${e.answer.choice} ${pct(e.answer.probability)} ${secs(e.trace?.ms)}`];
    case "routed":
      return ["policy", `route ${name(e.index)} → ${e.finalAction}`];
    case "company_done":
      return null;
    case "note":
      return ["note", e.message];
    case "heartbeat":
      return null;
    case "run_finished":
      return ["run", `done ${e.counts.discovered} discovered · ${e.counts.actioned} actioned · ${e.counts.review} review · ${e.counts.dropped} dropped`];
    case "error":
      return ["error", `${e.index !== undefined ? `${name(e.index)} ` : ""}${e.message.slice(0, 120)}`];
  }
}

export function EventLog({ log, rows }: { log: LogLine[]; rows: Row[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length]);
  const name = (i: number) => rows.find((r) => r.index === i)?.result.company.name ?? `#${i}`;
  return (
    <div className="eventlog">
      <div className="rail-head">event stream <span className="muted">NDJSON · {log.length}</span></div>
      <div className="lines num" ref={ref}>
        {log.map(({ at, e }, i) => {
          const d = describe(e, name);
          if (!d) return null;
          return (
            <div key={i} className={`ll src-${d[0]}`}>
              <span className="lt">{hhmmss(at)}</span> <span className="ls">{d[0].padEnd(6)}</span> {d[1]}
            </div>
          );
        })}
        {!log.length && <div className="muted">waiting for events…</div>}
      </div>
    </div>
  );
}
