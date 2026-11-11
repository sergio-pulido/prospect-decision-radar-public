import type { DiscoveryLine } from "./reducer";

const NAMES: Record<string, string> = { linkup: "Linkup", cala: "Cala", manual: "Pasted list", seed: "Seed JSON", fixture: "Sample companies" };

export function sourceName(s: string): string {
  return NAMES[s] ?? s;
}

/** Per query sent: provider, live/fixture, city, exact query, companies returned, latency. */
export function DiscoveryStrip({ lines }: { lines: DiscoveryLine[] }) {
  if (!lines.length) return null;
  return (
    <div className="dstrip">
      <h3>Discovery</h3>
      <div className="dgrid">
        {lines.map((d, i) => (
          <div key={`${d.provider}-${d.city}-${i}`} className={`dcard ${d.error ? "derr" : ""}`}>
            <div className="dhead">
              <span className={`chip chip-${d.provider}`}>{sourceName(d.provider)}</span>
              <span className={`badge ${d.mode}`}>{d.mode === "live" ? "live" : "fixture"}</span>
              {d.city && <span className="muted small">{d.city}</span>}
              <span className="dstat">
                {d.pending ? <><i className="dot" /> querying…</> : <><b>{d.count}</b> companies · {(d.ms / 1000).toFixed(1)} s</>}
              </span>
            </div>
            <details>
              <summary className="small">exact query</summary>
              <pre>{d.query}</pre>
            </details>
            {d.error && <div className="err small">{d.error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
