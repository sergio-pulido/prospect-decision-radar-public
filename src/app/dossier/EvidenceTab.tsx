"use client";

import { fieldText, recencyOf } from "../../core/dossier";
import { signalById } from "../../core/signals";
import type { CompanyResult, Profile } from "../../core/types";
import { CitedText, ProbBars } from "./parts";

interface Props {
  r: CompanyResult;
  profile: Profile;
  city: string;
  /** Reference date for recency (when the research was done). */
  refIso: string;
}

const CHIP: Record<string, string> = { yes: "pos", no: "neg", unknown: "unk" };

/** Evidence: one row per question, every option's probability, the full research text with numbered citations. */
export function EvidenceTab({ r, profile, city, refIso }: Props) {
  const ev = r.evidence;
  if (!r.gate2.length) return <p className="d-quiet d-tab">No evidence questions were asked for this company.</p>;
  return (
    <div className="d-tab d-evidence">
      {r.gate2.map((a) => {
        const q = profile.gate2.find((x) => x.id === a.questionId);
        const sig = signalById(a.questionId);
        const fieldId = q?.evidenceField;
        const raw = fieldId ? ev?.fields[fieldId] : undefined;
        const text = fieldId ? fieldText(fieldId, raw, a.choice) : null;
        const plain = (q?.plain?.[a.choice] ?? sig?.tick[a.choice as "yes"] ?? a.choice).replaceAll("{city}", city);
        const positive = q?.positive?.includes(a.choice);
        const kind = a.choice === "unknown" ? "unk" : positive ? "pos" : CHIP[a.choice] ?? "neg";
        const rec = recencyOf(a.questionId, raw, refIso);
        return (
          <article key={a.questionId} className="d-ev">
            <header className="d-ev-head">
              <span className="d-ev-q">{sig?.label ?? (a.questionId === "headcount_in_range" ? "Team size in your range" : a.questionId.replace(/_/g, " "))}</span>
              <span className={`d-answer ${kind}`}>{plain}</span>
            </header>
            <p className="d-ev-ask">{q?.instructions ?? a.question}</p>
            <ProbBars answer={a} question={q} />
            {rec && <p className={`d-recency ${rec.within ? "in" : "out"}`}>{rec.label} · {rec.within ? `within ${rec.months} months` : `older than ${rec.months} months`}</p>}
            {text ? (
              <CitedText text={text} sources={ev?.sources ?? []} />
            ) : fieldId?.startsWith("apollo_") ? (
              <p className="d-quiet">{raw ?? "No company data for this."}</p>
            ) : (
              <p className="d-quiet">Not stated in the research.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
