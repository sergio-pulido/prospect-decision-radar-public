"use client";

// Small presentational pieces for the Simple view: SF Symbols-like icons, segmented control, monogram.
import { motion } from "motion/react";
import type { ReactNode, SVGProps } from "react";

/** Inputs never trigger password-manager or browser autofill overlays. */
export const NO_AUTOFILL = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true", "data-bwignore": true } as const;

export const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

type IconName = "check" | "question" | "xmark" | "arrowUpRight" | "doc" | "mapPin" | "globe" | "chevronRight" | "dot";

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M4.5 10.5l3.5 3.5 7.5-8" />,
  question: <><path d="M7.5 7.5a2.5 2.5 0 1 1 3.6 2.24c-.66.33-1.1.9-1.1 1.6v.66" /><circle cx="10" cy="14.6" r=".6" fill="currentColor" stroke="none" /></>,
  xmark: <path d="M6 6l8 8M14 6l-8 8" />,
  arrowUpRight: <path d="M7 13l6-6M8 7h5v5" />,
  doc: <><path d="M6 3.5h5.5L15 7v9.5H6z" /><path d="M11.5 3.5V7H15M8.5 10.5h4M8.5 13h4" /></>,
  mapPin: <><path d="M10 17s5-4.6 5-8.5a5 5 0 1 0-10 0C5 12.4 10 17 10 17z" /><circle cx="10" cy="8.5" r="1.8" /></>,
  globe: <><circle cx="10" cy="10" r="6.5" /><path d="M3.5 10h13M10 3.5c1.8 1.8 2.7 4 2.7 6.5s-.9 4.7-2.7 6.5c-1.8-1.8-2.7-4-2.7-6.5s.9-4.7 2.7-6.5z" /></>,
  chevronRight: <path d="M8 5l5 5-5 5" />,
  dot: <circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />,
};

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {PATHS[name]}
    </svg>
  );
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  id: string;
}

/** iOS-style segmented control. The selected thumb glides between segments. */
export function Segmented<T extends string>({ options, value, onChange, label, id }: SegmentedProps<T>) {
  return (
    <div className="a-seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="a-seg-thumb" transition={SPRING} />}
          <span className="a-seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** 40px rounded square: neutral initials, or the company's own icon on white when a source provides one. */
export function Monogram({ name, size = 40, icon }: { name: string; size?: number; icon?: string }) {
  const words = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
  return (
    <span className={`a-mono ${icon ? "icon" : ""}`} style={{ width: size, height: size }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {icon ? <img src={icon} alt="" referrerPolicy="no-referrer" loading="lazy" /> : initials}
    </span>
  );
}

/** Small honest label: "Saved example", "Approximate location". Present, never hidden. */
export function Pill({ children }: { children: ReactNode }) {
  return <span className="a-pill">{children}</span>;
}

export const OUTCOME = { call: "#34c759", email: "#0071e3", check: "#ff9f0a", later: "#8e8e93" } as const;
