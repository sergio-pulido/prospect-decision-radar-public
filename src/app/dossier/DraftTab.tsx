"use client";

import { useState } from "react";
import { cleanDraft, fieldText, firstSentence } from "../../core/dossier";
import type { CompanyResult, Profile } from "../../core/types";
import { Icon } from "../simple/ui";
import { Section } from "./parts";

/** Draft: the template filled with evidence, which evidence it used, Copy. Nothing is ever sent. */
export function DraftTab({ r, profile, city }: { r: CompanyResult; profile: Profile; city: string }) {
  const [copied, setCopied] = useState(false);
  const used = r.gate2
    .map((a) => ({ a, q: profile.gate2.find((x) => x.id === a.questionId) }))
    .filter(({ a, q }) => q?.positive?.includes(a.choice) && a.probability >= 0.5 && q.evidenceField && r.evidence?.fields[q.evidenceField]);
  const draft = r.draft ? cleanDraft(r.draft) : undefined;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="d-tab">
      <div className="a-paper">{draft ?? "No draft for this company."}</div>
      <div className="d-draft-actions">
        <button className="a-btn primary small" onClick={copy} disabled={!draft}><Icon name="doc" size={14} /> {copied ? "Copied" : "Copy"}</button>
        <span className="d-quiet">Nothing is ever sent: copy it into your own email.</span>
      </div>
      <Section title="Evidence used in this draft">
        {used.length ? (
          <ul className="d-used">
            {used.map(({ a, q }) => (
              <li key={a.questionId}>
                <b>{(q!.plain?.[a.choice] ?? a.choice).replaceAll("{city}", city)}</b>: {firstSentence(fieldText(q!.evidenceField!, r.evidence!.fields[q!.evidenceField!])!)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="d-quiet">No positive, sourced evidence: the draft says so.</p>
        )}
      </Section>
    </div>
  );
}
