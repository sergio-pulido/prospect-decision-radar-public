"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BUCKETS, bucketOf, CARD_STATE_TEXT, cardState, companyFavicon, confidenceOf, listOrder, progressOf, sizeNote, type Bucket, type CardState } from "../../core/plain";
import type { Profile } from "../../core/types";
import { sectorOf } from "../radar/geometry";
import type { Row } from "../radar/reducer";
import { CityMap, type Pin } from "./CityMap";
import { Monogram, OUTCOME, Pill, SPRING } from "./ui";

/** Outcome colours: used only as small dots, pins and meter fills. */
export const BUCKET_COLOR = OUTCOME;
const INK = "#1d1d1f";
const FAILED = "#ff3b30";

interface Props {
  rows: Row[];
  profile?: Profile;
  threshold: number;
  done: boolean;
  onNext: () => void;
  onOpen: (index: number) => void;
}

interface Item {
  row: Row;
  index: number;
  state: CardState;
  bucket?: Bucket;
  p?: number;
}

/** "software · 45 people · Barcelona"; a size outside the range is flagged in place. */
function Meta({ row, profile }: { row: Row; profile?: Profile }) {
  const c = row.result.company;
  const apollo = c.employeesSource === "apollo";
  const out = profile ? sizeNote(c.employees, profile.sizeRange, apollo ? "Apollo" : undefined) : undefined;
  const people = typeof c.employees === "number" && c.employees > 0 ? `${c.employees} people` : undefined;
  const parts = [c.sector, people, c.city].filter(Boolean) as string[];
  return (
    <div className="a-row-meta" title={out ?? parts.join(" · ")}>
      {parts.map((x, i) => (
        <span key={x}>
          {i > 0 && " · "}
          <span className={x === people && out ? "out" : undefined}>{x}</span>
        </span>
      ))}
    </div>
  );
}

function CompanyRow({ item, profile, hovered, onHover, onOpen }: { item: Item; profile?: Profile; hovered: boolean; onHover: (k: string | null) => void; onOpen: (index: number) => void }) {
  const { row, state, bucket } = item;
  const r = row.result;
  const status = bucket ? BUCKETS.find((b) => b.id === bucket)!.title : CARD_STATE_TEXT[state];
  const conf = r.action && bucket ? confidenceOf(r.action.probability) : undefined;
  const icon = companyFavicon(r.company.website, [...(r.company.sources ?? []), ...(r.evidence?.sources ?? [])]);
  return (
    <motion.article
      layout="position"
      data-co={row.index}
      className={`a-row-co ${hovered ? "hl" : ""} state-${state}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      onMouseEnter={() => onHover(`${row.index}`)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onOpen(row.index)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(row.index))}
      role="button"
      tabIndex={0}
      aria-label={`${r.company.name}: open the dossier`}
    >
      <Monogram name={r.company.name} icon={icon} />
      <div className="a-row-main">
        <div className="a-row-name">{r.company.name}</div>
        <Meta row={row} profile={profile} />
      </div>
      <div className="a-row-status">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={status} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            {bucket && <i className="a-dot" style={{ background: BUCKET_COLOR[bucket] }} />}
            {status}
          </motion.span>
        </AnimatePresence>
        {conf && <span className="a-conf">{conf.word.replace(": please check", "")}</span>}
      </div>
    </motion.article>
  );
}

/** Step 2: companies appear as they are found and settle into the order of what to do. One map per city. */
export function Step2Found({ rows, profile, threshold, done, onNext, onOpen }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [showNoFit, setShowNoFit] = useState(false);
  const progress = progressOf(rows.map((r) => r.result));
  const items: Item[] = rows
    .filter((r) => r.result.stage !== "dropped_gate1")
    .map((row) => {
      const state = cardState(row.result, done);
      const bucket = state === "decided" ? bucketOf(row.result.action, threshold) : undefined;
      return { row, index: row.index, state, bucket, p: row.result.action?.probability };
    });
  const ordered = listOrder(items);
  const noFit = rows.filter((r) => r.result.stage === "dropped_gate1");
  const cities = profile?.cities ?? [];
  const coords = profile?.cityCoordinates ?? {};
  const mapped = cities.filter((c) => coords[c]);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const showMap = token.startsWith("pk.") && mapped.length > 0 && !mapFailed;
  const pins: Pin[] = items.map(({ row, state, bucket }) => {
    const loc = row.result.enrichment?.location;
    const color = bucket ? BUCKET_COLOR[bucket] : state === "failed" ? FAILED : INK;
    return { key: `${row.index}`, name: row.result.company.name, city: cities[sectorOf(row.result.company.city, cities)] ?? "", color, ...(loc ? { exact: [loc.lng, loc.lat] as [number, number] } : {}) };
  });
  const allExact = pins.length > 0 && pins.every((p) => p.exact);

  return (
    <section className="a-step">
      <h2>Who we found</h2>
      <div className="a-counters" aria-live="polite">
        <span><b className="a-num">{progress.found}</b> found</span>
        <span><b className="a-num">{progress.checked}</b> checked</span>
        <span><b className="a-num">{progress.decided}</b> decided</span>
      </div>
      <div className={`a-split ${showMap ? "" : "nomap"}`}>
        <div>
          <div className="a-listhead">
            <span className="a-tertiary a-small">{done ? "Most urgent first" : "Ready when every company is decided"}</span>
            <button className="a-btn primary" disabled={!done} onClick={onNext}>See what to do</button>
          </div>
          <div className="a-list">
            {ordered.length === 0 && <p className="a-secondary">Looking for companies…</p>}
            {ordered.map((item) => (
              <CompanyRow key={item.index} item={item} profile={profile} hovered={hovered === `${item.index}`} onHover={setHovered} onOpen={onOpen} />
            ))}
            {noFit.length > 0 && (
              <div className="a-nofit">
                <button className="a-textlink" onClick={() => setShowNoFit(!showNoFit)}>
                  {noFit.length} didn&apos;t fit your profile · {showNoFit ? "hide" : "why?"}
                </button>
                {showNoFit && (
                  <ul>
                    {noFit.map((row) => (
                      <li key={row.index}>
                        <b>{row.result.company.name}</b>
                        <span className="a-secondary"> · {profile?.gate1.plain?.[row.result.gate1?.choice ?? ""] ?? "Outside your profile"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
        {showMap && (
          <div className="a-maps" style={{ ["--map-h" as string]: `calc((100vh - ${mapped.length > 1 ? 140 : 120}px) / ${mapped.length})` }}>
            {mapped.map((c) => (
              <CityMap key={c} token={token} city={c} center={coords[c]!} pins={pins.filter((p) => p.city === c)} hovered={hovered} onHover={setHovered} onPick={(k) => onOpen(Number(k))} onFail={() => setMapFailed(true)} />
            ))}
            {!allExact && <p className="a-mapnote"><Pill>Approximate location · city level</Pill></p>}
          </div>
        )}
      </div>
    </section>
  );
}
