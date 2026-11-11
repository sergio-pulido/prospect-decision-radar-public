"use client";

import "./simple.css";
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { RadarRun } from "../radar/useRadarRun";
import { interruptedNote, plainNote } from "../../core/plain";
import type { TabId } from "../dossier/types";
import { exampleFor, exampleLabel } from "../radar/examples";
import { Step1Who } from "./Step1Who";
import { Step2Found } from "./Step2Found";
import { Step3Todo } from "./Step3Todo";
import { Pill, Segmented, SPRING } from "./ui";

type Step = 1 | 2 | 3;
const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: "What you sell" },
  { n: 2, label: "Who we found" },
  { n: 3, label: "What to do" },
];

interface Props {
  r: RadarRun;
  toPro: () => void;
  openDossier: (index: number, tab?: TabId) => void;
}

const MODES = [
  { value: "simple", label: "Simple" },
  { value: "pro", label: "Pro" },
] as const;

/** Guided three-step journey over the same run engine as Pro. Calm, light, one primary action per step. */
export function SimpleView({ r, toPro, openDossier }: Props) {
  const [step, setStepState] = useState<Step>(r.idle ? 1 : 2);
  // Scroll first, then switch: the shared-layout flight (row -> column card) measures from the new scroll position.
  const flipFrom = useRef<Map<number, DOMRect> | undefined>(undefined);
  const setStep = (n: Step) => {
    window.scrollTo({ top: 0 });
    // Measure the step-2 rows (after the scroll) so step-3 cards can fly from them.
    flipFrom.current =
      step === 2 && n === 3
        ? new Map([...document.querySelectorAll<HTMLElement>("[data-co]")].map((e) => [Number(e.dataset.co), e.getBoundingClientRect()]))
        : undefined;
    setStepState(n);
  };
  const flipping = step === 3 && !!flipFrom.current;
  // An interrupted run (stream closed early) is over too: step 3 shows what was decided.
  const done = r.view.status === "finished" || r.view.status === "interrupted";
  const decidedCount = r.view.rows.filter((x) => ["actioned", "review", "dropped_gate1"].includes(x.result.stage)).length;
  const stopped = interruptedNote(r.view.status, decidedCount, r.view.rows.length);
  const example = exampleFor(r.runs, r.settings.profileId);
  const exampleRun = r.runs.find((x) => x.id === example);
  const exampleSummary = exampleRun ? exampleLabel(exampleRun).replace(/^★ /, "") : undefined;

  useEffect(() => {
    if (r.running && step === 1) setStep(2);
  }, [r.running, step]);

  const reachable = (n: Step) => n === 1 || (n === 2 && !r.idle) || (n === 3 && done);

  return (
    <MotionConfig reducedMotion="user">
      <div className="apple">
        <header className="a-top">
          <div className="a-top-inner">
            <span className="a-brand">Prospect Decision Radar</span>
            <Segmented id="mode" label="View" options={MODES} value="simple" onChange={(v) => v === "pro" && toPro()} />
          </div>
        </header>

        <main className={`a-main ${step === 1 ? "" : "compact"}`}>
          {/* The hero opens the story; once the search starts, the work takes the stage. */}
          <AnimatePresence initial={false}>
            {step === 1 && (
              <motion.section className="a-hero" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={SPRING}>
                <h1>Know who to sell to next.</h1>
                <p>Find the companies most likely to buy from you now, and why.</p>
              </motion.section>
            )}
          </AnimatePresence>

          <nav className="a-stepper" aria-label="Steps">
            <ol>
              {STEPS.map((s) => (
                <li key={s.n}>
                  <button className={step === s.n ? "on" : ""} disabled={!reachable(s.n)} onClick={() => setStep(s.n)} aria-current={step === s.n ? "step" : undefined}>
                    {s.label}
                  </button>
                </li>
              ))}
            </ol>
            <div className="a-stepper-track">
              <motion.div className="a-stepper-fill" initial={false} animate={{ scaleX: step / 3 }} transition={SPRING} />
            </div>
          </nav>

          <div className="a-notes">
            {r.replayOf && step > 1 && <Pill>Saved example · a real search recorded earlier, no new searches</Pill>}
            {stopped && <p className="a-warn">{stopped}</p>}
            {r.error && !stopped && <p className="a-warn">Something went wrong while searching. Try again, or use a saved example.</p>}
            {!r.replayOf && [...new Set(r.view.notes.map(plainNote))].map((n) => <p key={n} className="a-warn">{n}</p>)}
          </div>

          <LayoutGroup>
            {/* Steps cross-fade and slide 12px. Going 2 -> 3 the old step leaves at once and the cards fly instead. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={flipping ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={step === 2 ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -12, transition: { duration: 0.15 } }}
                transition={SPRING}
              >
                {step === 1 && (
                  <Step1Who
                    profiles={r.profiles.filter((p) => !p.private)}
                    profile={r.profile}
                    onPreset={(id) => {
                      r.setSettings((x) => ({ ...x, profileId: id }));
                      r.setOverride(undefined);
                    }}
                    value={r.override ?? {}}
                    onChange={r.setOverride}
                    busy={r.running}
                    hasExample={!!example}
                    exampleNote={exampleSummary}
                    onFind={() => {
                      setStep(2);
                      void r.go(r.override);
                    }}
                    onExample={() => {
                      setStep(2);
                      if (example) void r.replay(example, 3);
                    }}
                  />
                )}
                {step === 2 && <Step2Found rows={r.view.rows} profile={r.runProfile} threshold={r.threshold} done={done} onNext={() => setStep(3)} onOpen={openDossier} />}
                {step === 3 && <Step3Todo rows={r.view.rows} profile={r.runProfile} threshold={r.threshold} onOpen={openDossier} flipFrom={flipFrom.current} />}
              </motion.div>
            </AnimatePresence>
          </LayoutGroup>
        </main>
      </div>
    </MotionConfig>
  );
}
