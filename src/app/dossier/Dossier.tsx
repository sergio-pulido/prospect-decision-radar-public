"use client";

import "../simple/simple.css";
import "./dossier.css";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { whySentence } from "../../core/dossier";
import { BUCKETS, bucketOf, cardState, companyFavicon, confidenceOf, listOrder } from "../../core/plain";
import type { Profile } from "../../core/types";
import { sectorOf } from "../radar/geometry";
import type { DiscoveryLine, Row } from "../radar/reducer";
import { Icon, Monogram, OUTCOME, SPRING } from "../simple/ui";
import { CompanyTab } from "./CompanyTab";
import { DecidedTab } from "./DecidedTab";
import { DraftTab } from "./DraftTab";
import { EvidenceTab } from "./EvidenceTab";
import { Meter } from "./parts";
import { SourcesTab } from "./SourcesTab";
import { TABS, type TabId, type WhatIfResult } from "./types";
import { WhyTab } from "./WhyTab";

interface Props {
  rows: Row[];
  /** Row index of the open company, or null when closed. */
  index: number | null;
  tab: TabId;
  profile?: Profile;
  threshold: number;
  runId?: string;
  discovery: DiscoveryLine[];
  /** True once the run has ended (finished or interrupted). */
  done: boolean;
  whatIfs: Record<number, WhatIfResult>;
  onWhatIf: (index: number, w: WhatIfResult) => void;
  onOpen: (index: number, tab?: TabId) => void;
  onTab: (tab: TabId) => void;
  onClose: () => void;
}

/** The order ← / → follow: the step-2 order (most urgent first), companies that did not fit last. */
export function dossierOrder(rows: Row[], threshold: number, done: boolean): number[] {
  const items = rows.map((row) => {
    const st = cardState(row.result, done);
    return { index: row.index, st, bucket: st === "decided" ? bucketOf(row.result.action, threshold) : undefined, p: row.result.action?.probability };
  });
  return [...listOrder(items.filter((i) => i.st !== "no_fit")), ...items.filter((i) => i.st === "no_fit")].map((i) => i.index);
}

function Header({ row, profile, threshold, done }: { row: Row; profile: Profile; threshold: number; done: boolean }) {
  const r = row.result;
  const c = r.company;
  const cities = profile.cities;
  const city = cities[sectorOf(c.city, cities)] ?? c.city ?? "";
  const st = cardState(r, done);
  const bucket = st === "decided" ? bucketOf(r.action, threshold) : undefined;
  const pill = bucket ? BUCKETS.find((b) => b.id === bucket)!.title : st === "no_fit" ? "Doesn't fit your profile" : st === "failed" ? "Couldn't check this one" : "Still checking";
  const conf = r.action ? confidenceOf(r.action.probability) : undefined;
  const icon = companyFavicon(c.website, [...(c.sources ?? []), ...(r.evidence?.sources ?? [])]);
  const size = typeof c.employees === "number" && c.employees > 0 ? `${c.employees} people (${c.employeesSource === "apollo" ? "Apollo" : "web"})` : undefined;
  const site = c.website ? (c.website.includes("://") ? c.website : `https://${c.website}`) : undefined;
  return (
    <div className="d-head">
      <Monogram name={c.name} icon={icon} size={56} />
      <div className="d-head-main">
        <h2 className="d-name">{c.name}</h2>
        {site && <a className="d-site" href={site} target="_blank" rel="noreferrer">{site.replace(/^https?:\/\//, "").replace(/\/$/, "")} <Icon name="arrowUpRight" size={12} /></a>}
        <p className="d-meta">{[c.city, c.sector, size].filter(Boolean).join(" · ")}</p>
        <div className="d-outcome">
          <span className="d-pill"><i className="a-dot" style={{ background: bucket ? OUTCOME[bucket] : "#c7c7cc" }} />{pill}</span>
          {conf && r.action && (
            <span className="d-conf">
              <Meter p={r.action.probability} threshold={threshold} color={bucket ? OUTCOME[bucket] : "#8e8e93"} />
              <span className="a-small a-secondary">{conf.word.replace(": please check", "")} · <span className="a-num">{conf.pct}%</span></span>
            </span>
          )}
        </div>
        <p className="d-why">{whySentence(profile, r, threshold, city)}</p>
      </div>
    </div>
  );
}

/** Company dossier: everything the run holds about one company. A side sheet over Simple or Pro. */
export function Dossier(props: Props) {
  const { rows, index, tab, profile, threshold, runId, discovery, done, whatIfs, onWhatIf, onOpen, onTab, onClose } = props;
  const row = rows.find((x) => x.index === index);
  const order = useMemo(() => dossierOrder(rows, threshold, done), [rows, threshold, done]);
  const pos = index === null ? -1 : order.indexOf(index);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const step = (d: number) => {
    if (pos < 0 || !order.length) return;
    onOpen(order[(pos + d + order.length) % order.length]!, tab);
  };

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    if (index !== null) closeBtn.current?.focus({ preventScroll: true });
    scroller.current?.scrollTo({ top: 0 });
  }, [index, tab]);

  const open = index !== null && !!row && !!profile;
  const city = row && profile ? profile.cities[sectorOf(row.result.company.city, profile.cities)] ?? row.result.company.city ?? "" : "";
  const refIso = row?.result.traces?.gate2?.at || row?.result.enrichment?.fetchedAt || new Date().toISOString();
  return (
    <AnimatePresence>
      {open && (
        <div className="a-dossier">
          <motion.div className="d-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className="d-sheet" role="dialog" aria-modal="true" aria-label={`${row.result.company.name}: dossier`} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={SPRING}>
            <div className="d-top">
              <div className="d-nav">
                <button className="d-navbtn" onClick={() => step(-1)} aria-label="Previous company" title="Previous (←)"><Icon name="chevronRight" size={16} style={{ transform: "rotate(180deg)" }} /></button>
                <span className="a-small a-tertiary a-num">{pos + 1} of {order.length}</span>
                <button className="d-navbtn" onClick={() => step(1)} aria-label="Next company" title="Next (→)"><Icon name="chevronRight" size={16} /></button>
              </div>
              <button ref={closeBtn} className="a-btn secondary small" onClick={onClose}>Close</button>
            </div>
            <div className="d-scroll" ref={scroller}>
              <Header row={row} profile={profile} threshold={threshold} done={done} />
              <nav className="d-tabs" role="tablist" aria-label="Dossier">
                {TABS.map((t) => (
                  <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => onTab(t.id)}>{t.label}</button>
                ))}
              </nav>
              {tab === "why" && <WhyTab r={row.result} profile={profile} threshold={threshold} city={city} whatIf={whatIfs[row.index]} />}
              {tab === "evidence" && <EvidenceTab r={row.result} profile={profile} city={city} refIso={refIso} />}
              {tab === "company" && <CompanyTab r={row.result} discovery={discovery} />}
              {tab === "sources" && <SourcesTab r={row.result} />}
              {tab === "decided" && <DecidedTab r={row.result} index={row.index} runId={runId} profile={profile} threshold={threshold} onWhatIf={(w) => onWhatIf(row.index, w)} />}
              {tab === "draft" && <DraftTab r={row.result} profile={profile} city={city} />}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
