import type { Profile } from "../../core/types";
import { sourceName } from "./DiscoveryStrip";
import { pct } from "./format";
import { routeAt, type Row } from "./reducer";
import { sectorOf } from "./geometry";

function StageCell({ row, threshold }: { row: Row; threshold: number }) {
  const r = row.result;
  if (row.activity !== "done") {
    const label = { queued: "queued", gate1: "gate 1 passed · research next", researching: "researching…", deciding: "deciding…" }[row.activity];
    return <span className="badge busy">{row.activity !== "queued" && <i className="dot" />}{label}</span>;
  }
  if (r.stage === "error" || (r.error && !routeAt(r, threshold))) return <span className="badge stage-error">error</span>;
  if (r.stage === "dropped_gate1") return <span className="badge stage-dropped_gate1">dropped at gate 1</span>;
  const route = routeAt(r, threshold);
  if (route) return <span className={`badge stage-${route}`}>{route === "review" ? "human review" : "actioned"}</span>;
  return <span className="badge">{r.stage.replace("_", " ")}</span>;
}

interface Props {
  rows: Row[];
  profile?: Profile;
  threshold: number;
  cityFilter: string;
  setCityFilter: (c: string) => void;
  selected: number | null;
  onSelect: (i: number) => void;
}

export function RunTable({ rows, profile, threshold, cityFilter, setCityFilter, selected, onSelect }: Props) {
  const cities = profile?.cities ?? [];
  const groupOf = (city?: string) => cities[sectorOf(city, cities)] ?? "Other";
  const groups = ["All", ...cities, "Other"].filter((g) => g === "All" || rows.some((r) => groupOf(r.result.company.city) === g));
  const visible = cityFilter === "All" ? rows : rows.filter((r) => groupOf(r.result.company.city) === cityFilter);
  return (
    <>
      {groups.length > 2 && (
        <div className="filters">
          <span className="muted small">City:</span>
          {groups.map((g) => (
            <button key={g} className={cityFilter === g ? "on" : ""} onClick={() => setCityFilter(g)}>
              {g} ({g === "All" ? rows.length : rows.filter((r) => groupOf(r.result.company.city) === g).length})
            </button>
          ))}
        </div>
      )}
      <div className="tablewrap">
        <table>
          <thead><tr><th>Company</th><th>Found by</th><th>City</th><th>Stage</th><th>Final action</th><th>Prob.</th><th>Signals</th></tr></thead>
          <tbody>
            {visible.map((row) => {
              const r = row.result;
              const route = routeAt(r, threshold);
              return (
                <tr key={`${row.index}-${r.company.name}`} className={`row enter ${selected === row.index ? "sel" : ""}`} onClick={() => onSelect(row.index)}>
                  <td>{r.company.name}{r.error && <div className="err small">{r.error}</div>}</td>
                  <td>{(r.company.foundBy ?? [r.company.discoveredBy]).map((s) => <span key={s} className={`chip chip-${s}`}>{sourceName(s)}</span>)}{r.enrichment?.matched && <span className="chip chip-apollo">Apollo</span>}</td>
                  <td>{r.company.city ?? "–"}</td>
                  <td><StageCell row={row} threshold={threshold} /></td>
                  <td>{route === "review" ? "needs_human_review" : route === "actioned" ? r.action?.choice : "–"}</td>
                  <td className="num">{pct(r.action?.probability ?? r.gate1?.probability)}</td>
                  <td>{r.signalStrength ?? "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
