"use client";

import { LayoutGroup, motion } from "motion/react";
import type { Profile } from "../../core/types";
import { sourceName } from "./DiscoveryStrip";
import { pct } from "./format";
import { routeAt, type Row } from "./reducer";

const PREFERRED = ["call_now", "send_email", "linkedin_touch", "nurture", "discard"];
export const REVIEW = "needs_review";

/** Columns from the profile's action labels (preferred order first), then human review. */
export function boardColumns(profile?: Profile): string[] {
  const labels = Object.keys(profile?.action.options ?? {});
  return [...PREFERRED.filter((l) => labels.includes(l)), ...labels.filter((l) => !PREFERRED.includes(l)), REVIEW];
}

interface BoardProps {
  profile?: Profile;
  rows: Row[];
  threshold: number;
  selected: number | null;
  onSelect: (index: number) => void;
}

/** Cards land in a column when `routed` arrives; the threshold slider moves them (layout animation). */
export function Board({ profile, rows, threshold, selected, onSelect }: BoardProps) {
  const cols = boardColumns(profile);
  const placed = rows
    .map((row) => ({ row, route: routeAt(row.result, threshold) }))
    .filter((x) => x.route)
    .map(({ row, route }) => ({ row, col: route === "review" ? REVIEW : row.result.action!.choice }));
  return (
    <LayoutGroup>
      <div className="board" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
        {cols.map((col) => {
          const cards = placed.filter((p) => p.col === col);
          return (
            <div key={col} className={`col col-${col}`}>
              <div className="col-head">
                <span>{col === REVIEW ? "needs review" : col.replace("_", " ")}</span>
                <b className="num">{cards.length}</b>
              </div>
              {cards.map(({ row }) => {
                const r = row.result;
                const fixture = r.evidence?.mode === "fixture" || r.traces?.action?.engine === "fixture-heuristic";
                return (
                  <motion.button
                    layout
                    layoutId={`card-${row.index}-${r.company.name}`}
                    key={`${row.index}-${r.company.name}`}
                    initial={{ opacity: 0, scale: 0.7, y: -24 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    className={`card ${fixture ? "fixture" : ""} ${selected === row.index ? "sel" : ""}`}
                    onClick={() => onSelect(row.index)}
                  >
                    <span className="card-name">{r.company.name}</span>
                    <span className="card-meta">
                      {(r.company.foundBy ?? [r.company.discoveredBy]).map((s) => <i key={s} className={`chip chip-${s}`}>{sourceName(s)}</i>)}
                      {r.enrichment?.matched && <i className="chip chip-apollo">Apollo</i>}
                      <span className="muted">{r.company.city ?? "–"}</span>
                    </span>
                    <span className="card-prob num">
                      {r.action?.choice} {pct(r.action?.probability)}
                    </span>
                    {fixture && <span className="fixture-tag">FIXTURE</span>}
                  </motion.button>
                );
              })}
            </div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
