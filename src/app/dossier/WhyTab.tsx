"use client";

import { couldNotFind, decisionPath, isPersonalProfile, wouldChange, whatPushed } from "../../core/dossier";
import type { CompanyResult, Profile } from "../../core/types";
import { Icon } from "../simple/ui";
import { Section, secs, SourceChip } from "./parts";
import type { WhatIfResult } from "./types";

interface Props {
  r: CompanyResult;
  profile: Profile;
  threshold: number;
  city: string;
  whatIf?: WhatIfResult;
}

/** Why: the decision path, what pushed it, what we couldn't find, what would change it. Plain language. */
export function WhyTab({ r, profile, threshold, city, whatIf }: Props) {
  const path = decisionPath(r, threshold, profile.actionLabels);
  const drivers = whatPushed(profile, r, threshold, city);
  const unknown = couldNotFind(profile, r, city);
  const change = wouldChange(profile, r);
  const sources = r.evidence?.sources ?? [];
  return (
    <div className="d-tab">
      <ol className="d-path" aria-label="Decision path">
        {path.map((s) => (
          <li key={s.id} className={`d-step ${s.state}`}>
            <span className="d-step-dot">{s.state === "done" ? <Icon name="check" size={12} /> : s.state === "review" ? "?" : s.state === "stopped" ? <Icon name="xmark" size={12} /> : ""}</span>
            <span className="d-step-title">{s.title}</span>
            <span className="d-step-detail">{s.detail}{s.ms ? ` · ${secs(s.ms)}` : ""}</span>
            {s.why && <span className="d-step-why">{s.why}</span>}
          </li>
        ))}
      </ol>

      {drivers.length > 0 && (
        <Section title="What pushed it here">
          <ul className="d-drivers">
            {drivers.map((d) => {
              const field = d.field ? r.evidence?.fields[d.field] : undefined;
              const urls = field ? [...new Set([...field.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]!))].filter((u) => !isPersonalProfile(u)).slice(0, 3) : [];
              return (
                <li key={d.text} className={`d-driver ${d.kind}`}>
                  <Icon name={d.kind === "for" ? "check" : "xmark"} size={16} className="d-driver-glyph" />
                  <div>
                    <div className="d-driver-text">{d.text}</div>
                    {d.evidence && <div className="d-driver-ev">{d.evidence}</div>}
                    <div className="d-chips">
                      {urls.map((u) => <SourceChip key={u} url={u} favicon={sources.find((s) => s.url === u)?.favicon} />)}
                      {!urls.length && d.via && <span className="d-quiet">Source: {d.via}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {unknown.length > 0 && (
        <Section title="What we couldn't find" quiet>
          <p className="d-quiet-list">{unknown.join(" · ")}</p>
        </Section>
      )}

      <Section title="What would change it">
        {whatIf ? (
          <p className="d-change">
            Without <b>{whatIf.removedLabels.join(", ")}</b>, the AI would choose <b>{whatIf.afterLabel}</b> ({whatIf.afterPct}%) instead of {whatIf.beforeLabel} ({whatIf.beforePct}%).
          </p>
        ) : change.length ? (
          <p className="d-change">Finding any of these would add a buying signal: <b>{change.join(", ")}</b>.</p>
        ) : (
          <p className="d-quiet">Every buying signal in your profile was answered. Try “What if” in How the AI decided.</p>
        )}
      </Section>
    </div>
  );
}
