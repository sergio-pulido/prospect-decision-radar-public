"use client";

import { useState } from "react";
import { growthPct } from "../../core/enrichment";
import type { CompanyResult } from "../../core/types";
import type { DiscoveryLine } from "../radar/reducer";
import { Section, secs, SourceChip } from "./parts";

const NAME: Record<string, string> = { linkup: "Linkup (web search)", cala: "Cala (company data)", manual: "Your list", seed: "Your list", fixture: "Sample data" };
const month = (iso?: string | null) => {
  const d = iso ? new Date(iso) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "–";
};
const growth = (v?: number | null) => {
  const g = growthPct(v);
  return g === undefined ? "–" : `${g > 0 ? "+" : ""}${g}%`;
};

function Fact({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div className="d-fact">
      <span className="d-fact-l">{label}</span>
      <span className="d-fact-v">{value}</span>
      <span className="d-fact-s">{source}</span>
    </div>
  );
}

/** Company data: Apollo facts and discovery facts, every value with its source. */
export function CompanyTab({ r, discovery }: { r: CompanyResult; discovery: DiscoveryLine[] }) {
  const [openQ, setOpenQ] = useState<string | null>(null);
  const e = r.enrichment?.matched ? r.enrichment : undefined;
  const f = e?.fields;
  const by = r.company.foundBy ?? [r.company.discoveredBy];
  const queries = discovery.filter((d) => by.includes(d.provider as never) && (!d.city || !r.company.city || r.company.city.toLowerCase().includes(d.city.toLowerCase()) || d.provider === "manual"));
  const discoverySource = by.map((s) => NAME[s] ?? s).join(" + ");
  return (
    <div className="d-tab">
      <Section title="Company data (Apollo)">
        {f ? (
          <>
            <div className="d-facts">
              <Fact label="Headcount" value={typeof f.estimated_num_employees === "number" && f.estimated_num_employees > 0 ? `${f.estimated_num_employees} people` : "–"} source="Apollo estimate" />
              <Fact label="Growth 6 months" value={growth(f.organization_headcount_six_month_growth)} source="Apollo" />
              <Fact label="Growth 12 months" value={growth(f.organization_headcount_twelve_month_growth)} source="Apollo" />
              <Fact label="Growth 24 months" value={growth(f.organization_headcount_twenty_four_month_growth)} source="Apollo" />
              <Fact label="Industry" value={f.industry ?? "–"} source="Apollo" />
              <Fact label="HQ city" value={[f.city, f.country].filter(Boolean).join(", ") || "–"} source="Apollo" />
              <Fact label="Total raised" value={f.total_funding_printed ?? "–"} source="Apollo" />
              <Fact label="Latest round" value={f.latest_funding_stage ? `${f.latest_funding_stage}, ${month(f.latest_funding_round_date)}` : "–"} source="Apollo" />
            </div>
            {f.funding_events?.length ? (
              <table className="d-table">
                <thead><tr><th>Date</th><th>Stage</th><th>Amount</th></tr></thead>
                <tbody>
                  {f.funding_events.map((x, i) => (
                    <tr key={i}><td>{month(x.date)}</td><td>{x.type ?? "–"}</td><td className="a-num">{x.amount ? `${x.amount}${x.currency ? ` ${x.currency}` : ""}` : "–"}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {r.enrichment?.location && <p className="d-quiet">Office placed on the map from its address (geocoded with Mapbox).</p>}
          </>
        ) : (
          <p className="d-quiet">{r.enrichment && !r.enrichment.matched ? "Apollo returned a different organization for this website, so nothing was kept." : "No company data for this company."}</p>
        )}
      </Section>

      <Section title="How we found it">
        <div className="d-facts">
          <Fact label="Found by" value={discoverySource} source="Discovery" />
          {r.company.website && <Fact label="Website" value={r.company.website} source={discoverySource} />}
          {r.company.city && <Fact label="City" value={r.company.city} source={discoverySource} />}
          {r.company.sector && <Fact label="Sector" value={r.company.sector} source={discoverySource} />}
          {typeof r.company.employees === "number" && r.company.employees > 0 && (
            <Fact label="Team size" value={`${r.company.employees} people`} source={r.company.employeesSource === "apollo" ? "Apollo" : discoverySource} />
          )}
          {r.company.description && <Fact label="Description" value={r.company.description} source={discoverySource} />}
        </div>
        {r.company.sources?.length ? (
          <div className="d-chips">{r.company.sources.map((s) => <SourceChip key={s.url} url={s.url} favicon={s.favicon} />)}</div>
        ) : null}
        {queries.map((q, i) => (
          <div key={i} className="d-query">
            <button className="a-textlink" onClick={() => setOpenQ(openQ === `${i}` ? null : `${i}`)}>
              {openQ === `${i}` ? "Hide" : "Show"} the exact {NAME[q.provider] ?? q.provider} query{q.city ? ` for ${q.city}` : ""}
            </button>
            <span className="d-quiet"> · {q.count} found{q.ms ? ` · ${secs(q.ms)}` : ""}</span>
            {openQ === `${i}` && <pre className="d-mono">{q.query}</pre>}
          </div>
        ))}
      </Section>
    </div>
  );
}
