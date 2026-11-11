"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Funnel as FunnelCounts } from "./reducer";

const STEPS: Array<{ key: keyof FunnelCounts; label: string; tone: string }> = [
  { key: "discovered", label: "discovered", tone: "live" },
  { key: "passedGate1", label: "passed gate 1", tone: "live" },
  { key: "researched", label: "researched", tone: "live" },
  { key: "gate2", label: "gate 2 answered", tone: "jev" },
  { key: "actioned", label: "actioned", tone: "ok" },
  { key: "review", label: "human review", tone: "warn" },
  { key: "dropped", label: "dropped", tone: "bad" },
];

function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      from.current = value;
      return;
    }
    const ctl = animate(from.current, value, { duration: 0.6, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    from.current = value;
    return () => ctl.stop();
  }, [value, reduce]);
  return <b className="num big">{shown}</b>;
}

export function Funnel({ counts }: { counts: FunnelCounts }) {
  const max = Math.max(1, counts.discovered);
  return (
    <div className="funnel" aria-label="Decision funnel">
      {STEPS.map((s) => (
        <div key={s.key} className={`fstep tone-${s.tone}`}>
          <CountUp value={counts[s.key]} />
          <div className="fside">
            <span>{s.label}</span>
            <div className="fbar"><div style={{ transform: `scaleX(${counts[s.key] / max})` }} /></div>
          </div>
        </div>
      ))}
    </div>
  );
}
