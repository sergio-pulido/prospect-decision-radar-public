"use client";

// Small building blocks shared by the dossier tabs.
import type { ReactNode } from "react";
import { type Citation, hostOf, parseCitations } from "../../core/dossier";
import type { Answer, DecisionQuestion, Source } from "../../core/types";
import { Icon } from "../simple/ui";

/** One source as a quiet chip: favicon (as the provider returned it) or a globe, then the domain. Opens in a new tab. */
export function SourceChip({ url, favicon, label, n }: { url: string; favicon?: string; label?: string; n?: number }) {
  return (
    <a className="d-chip" href={url} target="_blank" rel="noreferrer" title={url}>
      {n !== undefined && <span className="d-chip-n">{n}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {favicon ? <img src={favicon} alt="" width={12} height={12} referrerPolicy="no-referrer" loading="lazy" /> : <Icon name="globe" size={12} />}
      <span className="d-chip-t">{label ?? hostOf(url)}</span>
    </a>
  );
}

export function Chips({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <span className="d-chips">
      {citations.map((c) => <SourceChip key={c.url} url={c.url} favicon={c.favicon} n={c.n} label={c.domain} />)}
    </span>
  );
}

/** Research text with its markdown citations turned into numbered source chips ([1] eu-startups.com). */
export function CitedText({ text, sources }: { text: string; sources: ReadonlyArray<Source> }) {
  const p = parseCitations(text, sources);
  const byN = new Map(p.citations.map((c) => [c.n, c]));
  return (
    <div className="d-cited">
      <p>
        {p.segments.map((s, i) => ("text" in s ? <span key={i}>{s.text}</span> : <sup key={i} className="d-ref">[{s.cite}]</sup>))}
      </p>
      <Chips citations={[...byN.values()]} />
      {p.hidden > 0 && <p className="d-quiet">{p.hidden} personal-profile {p.hidden === 1 ? "source" : "sources"} hidden</p>}
    </div>
  );
}

const optionLabel = (label: string) => label.replace(/_/g, " ");

/** Every option with its probability, the chosen one highlighted. */
export function ProbBars({ answer, question, describe = false }: { answer: Answer; question?: DecisionQuestion; describe?: boolean }) {
  const labels = Object.keys(question?.options ?? answer.probabilities);
  const rows = (labels.length ? labels : Object.keys(answer.probabilities)).map((l) => ({ l, p: answer.probabilities[l] ?? 0 }));
  return (
    <div className="d-bars">
      {rows.map(({ l, p }) => (
        <div key={l} className={`d-bar ${l === answer.choice ? "on" : ""}`}>
          <span className="d-bar-l">{optionLabel(l)}</span>
          <span className="d-bar-track"><span style={{ transform: `scaleX(${Math.max(0, Math.min(1, p))})` }} /></span>
          <span className="d-bar-p a-num">{Math.round(p * 100)}%</span>
          {describe && question?.options[l] && <span className="d-bar-d">{question.options[l]!.description}</span>}
        </div>
      ))}
    </div>
  );
}

/** Confidence meter with the review threshold as a tick. */
export function Meter({ p, threshold, color }: { p: number; threshold: number; color: string }) {
  return (
    <span className="d-meter" title={`${Math.round(p * 100)}% · your bar ${Math.round(threshold * 100)}%`}>
      <span className="d-meter-fill" style={{ transform: `scaleX(${p})`, background: color }} />
      <span className="d-meter-tick" style={{ left: `${threshold * 100}%` }} />
    </span>
  );
}

export function Section({ title, children, quiet }: { title: string; children: ReactNode; quiet?: boolean }) {
  return (
    <section className={`d-section ${quiet ? "quiet" : ""}`}>
      <h4 className="a-micro">{title}</h4>
      {children}
    </section>
  );
}

export const secs = (ms?: number): string => (typeof ms === "number" ? (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`) : "");
