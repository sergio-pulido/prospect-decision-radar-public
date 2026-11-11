import type { Row } from "./reducer";

/** What is in flight right now, from decision_started / research_started events. */
export function Ticker({ rows, running }: { rows: Row[]; running: boolean }) {
  const deciding = rows.filter((r) => r.inFlight);
  const researching = rows.filter((r) => !r.inFlight && r.activity === "researching");
  // Nothing in flight: no empty box.
  if (!deciding.length && !researching.length) return null;
  return (
    <div className="ticker" aria-live="polite">
      {deciding.map((r) => (
        <div key={`d-${r.index}`} className={`tline ${r.inFlight!.engine === "jev" ? "jev" : "heur"}`}>
          <i className="dot" />
          <span>{r.inFlight!.engine === "jev" ? "Jev deciding" : "Heuristic (fixture) deciding"}:</span>{" "}
          <b>{r.result.company.name}</b> · <span className="num">{r.inFlight!.step}</span> ·{" "}
          <span className="num muted">{r.inFlight!.questions.join(", ")}</span>
        </div>
      ))}
      {researching.map((r) => (
        <div key={`r-${r.index}`} className={`tline ${r.result.company.discoveredBy === "fixture" ? "heur" : "live"}`}>
          <i className="dot" />
          <span>{r.result.company.discoveredBy === "fixture" ? "Fixture research" : "Linkup researching"}:</span> <b>{r.result.company.name}</b>
        </div>
      ))}
    </div>
  );
}
