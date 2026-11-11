"use client";

import { useState } from "react";
import { decodeEntities, groupSources } from "../../core/dossier";
import type { CompanyResult } from "../../core/types";
import { Icon } from "../simple/ui";

/** Sources: everything consulted, grouped by domain, cited or consulted. Personal profiles are hidden. */
export function SourcesTab({ r }: { r: CompanyResult }) {
  const [citedOnly, setCitedOnly] = useState(true);
  const ev = r.evidence;
  if (!ev) return <p className="d-quiet d-tab">This company was not researched.</p>;
  const s = groupSources(ev.sources, ev.fields, ev.consulted);
  const groups = s.groups.map((g) => ({ ...g, items: citedOnly ? g.items.filter((i) => i.cited) : g.items })).filter((g) => g.items.length);
  const notListed = s.consulted - s.hiddenPersonal - s.groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="d-tab">
      <div className="d-src-head">
        <p className="d-src-counts a-num">{s.consulted} consulted · {s.cited} cited · {s.domains} domains</p>
        <label className="d-toggle">
          <input type="checkbox" checked={citedOnly} onChange={(e) => setCitedOnly(e.target.checked)} /> Cited only
        </label>
      </div>
      {s.hiddenPersonal > 0 && <p className="d-quiet">{s.hiddenPersonal} personal-profile {s.hiddenPersonal === 1 ? "source" : "sources"} hidden</p>}
      {!citedOnly && notListed > 0 && <p className="d-quiet">{notListed} consulted sources are not included in this saved example (only cited ones are kept).</p>}
      <div className="d-groups">
        {groups.map((g) => (
          <div key={g.domain} className="d-group">
            <div className="d-group-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {g.favicon ? <img src={g.favicon} alt="" width={16} height={16} referrerPolicy="no-referrer" loading="lazy" /> : <Icon name="globe" size={16} />}
              <span className="d-group-d">{g.domain}</span>
              <span className="d-quiet a-num">{g.items.length}</span>
            </div>
            <ul>
              {g.items.map((i) => (
                <li key={i.url}>
                  <a href={i.url} target="_blank" rel="noreferrer">{decodeEntities(i.name)}</a>
                  <span className={`d-tag ${i.cited ? "cited" : ""}`}>{i.cited ? "cited" : "consulted"}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!groups.length && <p className="d-quiet">No cited sources for this company.</p>}
      </div>
    </div>
  );
}
