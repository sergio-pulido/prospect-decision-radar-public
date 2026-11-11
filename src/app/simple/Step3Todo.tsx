"use client";

import { animate, motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { actionName, briefing, BUCKETS, bucketOf, cardTicks, confidenceOf, reviewReason, reviewVerdict, sizeNote, type Bucket } from "../../core/plain";
import type { Profile } from "../../core/types";
import { sectorOf } from "../radar/geometry";
import type { Row } from "../radar/reducer";
import type { TabId } from "../dossier/types";
import { EvidenceRows } from "./Evidence";
import { BUCKET_COLOR } from "./Step2Found";
import { Icon, SPRING } from "./ui";

interface Props {
  rows: Row[];
  profile?: Profile;
  threshold: number;
  onOpen: (index: number, tab?: TabId) => void;
  /** Step-2 row positions measured just before the switch: each card flies from its row (FLIP). */
  flipFrom?: Map<number, DOMRect>;
}

interface CardProps {
  row: Row;
  order: number;
  profile?: Profile;
  threshold: number;
  bucket: Bucket;
  onOpen: (i: number, tab?: TabId) => void;
  from?: DOMRect;
}

export function verdictOf(row: Row, profile: Profile | undefined, bucket: Bucket): string {
  const a = row.result.action;
  if (bucket === "check") return reviewVerdict(a, profile?.actionLabels);
  return a ? profile?.action.plain?.[a.choice] ?? actionName(a.choice, profile?.actionLabels) : "No decision";
}

function ActionCard({ row, order, profile, threshold, bucket, onOpen, from }: CardProps) {
  const r = row.result;
  const el = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  // FLIP: start at the step-2 row's position, spring to the column. Position and opacity only (text never stretches).
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !from || reduce) return;
    // Measure the card's resting place: clear any transform a previous (StrictMode) run left behind.
    node.style.transform = "";
    node.style.opacity = "";
    const to = node.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const ctl = animate(node, { x: [dx, 0], y: [dy, 0], opacity: [0.4, 1] }, { ...SPRING, delay: order * 0.04 });
    return () => {
      // Never leave a card stranded mid-flight.
      ctl.stop();
      node.style.transform = "";
      node.style.opacity = "";
    };
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [whyOpen, setWhyOpen] = useState(false);
  const cities = profile?.cities ?? [];
  const city = cities[sectorOf(r.company.city, cities)] ?? r.company.city ?? "";
  const conf = r.action ? confidenceOf(r.action.probability) : undefined;
  const size = profile ? sizeNote(r.company.employees, profile.sizeRange, r.company.employeesSource === "apollo" ? "Apollo" : undefined) : undefined;
  // Three fact rows at most: a size outside the range counts as one.
  const ticks = profile ? cardTicks(profile, r, city, size ? 2 : 3) : [];
  const verdict = verdictOf(row, profile, bucket);
  return (
    <motion.article
      ref={el}
      className="a-card a-action clickable"
      // A click anywhere on the card (but not on its buttons) opens the dossier.
      onClick={(e) => !(e.target as HTMLElement).closest("button, a") && onOpen(row.index)}
    >
      <div className="a-action-head">
        <span className="a-action-name" title={r.company.name}>{r.company.name}</span>
        <span className="a-tertiary a-action-city">{r.company.city ?? ""}</span>
      </div>
      <p className="a-verdict" title={verdict}>{verdict}</p>
      {conf && (
        <div className="a-meter-row">
          <span className="a-meter"><span style={{ transform: `scaleX(${conf.pct / 100})`, background: BUCKET_COLOR[bucket] }} /></span>
          <span className="a-secondary a-small">{conf.word.replace(": please check", "")} · <span className="a-num">{conf.pct}%</span></span>
        </div>
      )}
      <EvidenceRows ticks={ticks} size={size} />
      {whyOpen && <p className="a-why">{reviewReason(r, threshold, profile?.actionLabels)}</p>}
      <div className="a-card-actions">
        {r.draft && <button className="a-btn secondary small" onClick={() => onOpen(row.index, "draft")}>Draft</button>}
        {bucket === "check" && <button className="a-textlink" onClick={() => setWhyOpen(!whyOpen)}>{whyOpen ? "Hide" : "Why not sure?"}</button>}
        <button className="a-textlink a-how" onClick={() => onOpen(row.index, "decided")}>
          How the AI decided <Icon name="arrowUpRight" size={14} />
        </button>
      </div>
    </motion.article>
  );
}

/** Step 3: a briefing headline from the run, then four plain columns. */
export function Step3Todo({ rows, profile, threshold, onOpen, flipFrom }: Props) {
  const decided = rows.filter((r) => r.result.stage === "actioned" || r.result.stage === "review");
  const failed = rows.filter((r) => !["actioned", "review", "dropped_gate1"].includes(r.result.stage));
  const byBucket = Object.fromEntries(BUCKETS.map((b) => [b.id, decided.filter((r) => bucketOf(r.result.action, threshold) === b.id)])) as Record<Bucket, Row[]>;
  const counts = Object.fromEntries(BUCKETS.map((b) => [b.id, byBucket[b.id].length])) as Record<Bucket, number>;
  const brief = briefing(counts);
  let order = 0;
  return (
    <section className="a-step">
      <h2>{brief.headline}</h2>
      {brief.rest && <p className="a-lead">{brief.rest}</p>}
      <div className="a-columns">
        {BUCKETS.map((b) => (
          <div key={b.id} className="a-col">
            <div className="a-col-head">
              <span className="a-col-label"><i className="a-dot" style={{ background: BUCKET_COLOR[b.id] }} />{b.title}</span>
              <span className="a-col-count a-num">{counts[b.id]}</span>
            </div>
            {byBucket[b.id].map((row) => (
              <ActionCard key={row.index} row={row} order={order++} profile={profile} threshold={threshold} bucket={b.id} onOpen={onOpen} from={flipFrom?.get(row.index)} />
            ))}
            {counts[b.id] === 0 && <p className="a-empty">Nobody here</p>}
          </div>
        ))}
      </div>
      {failed.length > 0 && <p className="a-tertiary">{failed.length} could not be checked this time: {failed.map((r) => r.result.company.name).join(", ")}.</p>}
    </section>
  );
}
