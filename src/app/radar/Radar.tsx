"use client";

import { motion } from "motion/react";
import type { Row } from "./reducer";
import { blipState, blipXY, C, polar, RINGS, sectorAngles, sectorOf, SIZE } from "./geometry";

interface RadarProps {
  cities: string[];
  rows: Row[];
  threshold: number;
  sweeping: boolean;
  selected: number | null;
  onSelect: (index: number) => void;
}

/** One sector per profile city (plus "Other" only if a company falls outside them). */
export function Radar({ cities, rows, threshold, sweeping, selected, onSelect }: RadarProps) {
  const hasOther = rows.some((r) => sectorOf(r.result.company.city, cities) === cities.length);
  const labels = hasOther ? [...cities, "Other"] : cities;
  const n = Math.max(1, labels.length);
  return (
    <svg className="radar" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Radar with sectors ${labels.join(", ")}`}>
      <defs>
        <radialGradient id="rg-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--radar-core)" />
          <stop offset="100%" stopColor="var(--panel)" />
        </radialGradient>
        <linearGradient id="rg-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--live)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--live)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={RINGS[3] + 12} fill="url(#rg-bg)" stroke="var(--line)" />
      {RINGS.map((r) => <circle key={r} cx={C} cy={C} r={r} className="ring" />)}
      {labels.map((label, i) => {
        const [a0, a1] = sectorAngles(i, n);
        const edge = polar(RINGS[3] + 12, a0);
        // Inside the outer band so the label never clips at the SVG edge.
        const mid = polar((RINGS[2] + RINGS[3]) / 2, (a0 + a1) / 2);
        return (
          <g key={label}>
            {n > 1 && <line x1={C} y1={C} x2={edge.x} y2={edge.y} className="spoke" />}
            <text x={mid.x} y={mid.y} className="sector-label" textAnchor="middle" dominantBaseline="middle">
              {label.toUpperCase()}
            </text>
          </g>
        );
      })}
      <g className={`sweep ${sweeping ? "on" : ""}`}>
        <path d={`M ${C} ${C} L ${C + RINGS[3] + 12} ${C} A ${RINGS[3] + 12} ${RINGS[3] + 12} 0 0 0 ${polar(RINGS[3] + 12, -0.6).x} ${polar(RINGS[3] + 12, -0.6).y} Z`} fill="url(#rg-sweep)" />
        <line x1={C} y1={C} x2={C + RINGS[3] + 12} y2={C} className="sweep-edge" />
      </g>
      <circle cx={C} cy={C} r={3} fill="var(--live)" />
      {rows.map((row) => {
        const { radius, tone } = blipState(row, threshold);
        const { x, y } = blipXY(row.result.company.name, sectorOf(row.result.company.city, cities), n, radius);
        const fixture = row.result.company.discoveredBy === "fixture";
        return (
          <motion.g
            key={`${row.index}-${row.result.company.name}`}
            className={`blip tone-${tone} ${fixture ? "fixture" : ""} ${selected === row.index ? "sel" : ""}`}
            initial={{ x: C, y: C, opacity: 0, scale: 0.2 }}
            animate={{ x, y, opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 70, damping: 16 }}
            onClick={() => onSelect(row.index)}
          >
            {tone === "deciding" && <circle r={9} className="pulse" />}
            <circle r={5.5} className="dot" />
            <title>{`${row.result.company.name} · ${tone}`}</title>
            {/* Decided blips sit in the crowded centre: their names live on the board, shown here only when selected. */}
            {(tone !== "actioned" && tone !== "review") || selected === row.index ? (
              <text x={9} y={3} className="blip-label">{row.result.company.name}</text>
            ) : null}
          </motion.g>
        );
      })}
    </svg>
  );
}
