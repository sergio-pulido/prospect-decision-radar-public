"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SIGNALS, type SignalId } from "../../core/signals";
import type { Profile, ProfileOverride } from "../../core/types";
import { Icon, NO_AUTOFILL, SPRING } from "./ui";

interface Props {
  profiles: Profile[];
  profile?: Profile;
  onPreset: (id: string) => void;
  value: ProfileOverride;
  onChange: (o: ProfileOverride) => void;
  onFind: () => void;
  onExample: () => void;
  busy: boolean;
  hasExample: boolean;
  /** "workspace · call 2 · email 1 · check 1 · not now 6": what the saved example holds. */
  exampleNote?: string;
}

function ChipRow({ label, items, onRemove, onAdd, placeholder }: { label: string; items: string[]; onRemove: (x: string) => void; onAdd: (x: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft("");
  };
  return (
    <div className="a-row">
      <div className="a-micro">{label}</div>
      <div className="a-chips">
        <AnimatePresence initial={false}>
          {items.map((x) => (
            <motion.span key={x} layout className="a-chip" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={SPRING}>
              {x}
              <button aria-label={`Remove ${x}`} onClick={() => onRemove(x)}>
                <Icon name="xmark" size={12} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          className="a-chip-input"
          value={draft}
          placeholder={placeholder}
          aria-label={`Add to ${label}`}
          {...NO_AUTOFILL}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          onBlur={add}
        />
      </div>
    </div>
  );
}

function TextRow({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <label className="a-row a-textrow">
      <span className="a-micro">{label}</span>
      <input className="a-text" value={value} maxLength={300} placeholder={hint} {...NO_AUTOFILL} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function PresetCards({ profiles, current, onPreset }: { profiles: Profile[]; current?: string; onPreset: (id: string) => void }) {
  return (
    <div className="a-presets" role="radiogroup" aria-label="Start from">
      {profiles.map((p) => (
        <button key={p.id} role="radio" aria-checked={p.id === current} className={`a-preset ${p.id === current ? "on" : ""}`} onClick={() => onPreset(p.id)}>
          <span className="a-preset-title">{p.name}</span>
          <span className="a-preset-line">{p.description}</span>
        </button>
      ))}
    </div>
  );
}

/** Step 1: pick what you sell, then adjust it. Edits apply to this search only. */
export function Step1Who({ profiles, profile, onPreset, value, onChange, onFind, onExample, busy, hasExample, exampleNote }: Props) {
  if (!profile) return <p className="a-secondary">Loading…</p>;
  const cities = value.cities ?? profile.cities;
  const sectors = value.sectors ?? profile.sectors;
  const size = value.sizeRange ?? profile.sizeRange;
  const signals = value.signals ?? profile.signals ?? [];
  const editable = !!profile.spec;
  const offer = value.offer ?? profile.offer;
  const missingMap = cities.filter((c) => !profile.cityCoordinates?.[c]);
  const toggleSignal = (id: SignalId) => {
    const next = signals.includes(id) ? signals.filter((s) => s !== id) : [...signals, id];
    if (next.length) onChange({ ...value, signals: next });
  };
  return (
    <section className="a-step">
      <h2>What do you sell, and to whom?</h2>
      <p className="a-lead">Start from the closest example, then change anything. Changes apply to this search only.</p>
      <PresetCards profiles={profiles} current={profile.id} onPreset={onPreset} />
      <div className="a-card a-form">
        {editable && (
          <>
            <TextRow label="What you sell" value={offer} hint="One line, e.g. payroll software for small teams" onChange={(v) => onChange({ ...value, offer: v })} />
            <TextRow label="Who buys it" value={value.buyer ?? profile.buyer ?? ""} hint="The kind of company, e.g. growing tech companies" onChange={(v) => onChange({ ...value, buyer: v })} />
          </>
        )}
        <ChipRow
          label="Cities"
          items={cities}
          placeholder="Add a city"
          onRemove={(x) => onChange({ ...value, cities: cities.filter((c) => c !== x) })}
          onAdd={(x) => onChange({ ...value, cities: [...new Set([...cities, x])] })}
        />
        {missingMap.length > 0 && <p className="a-tertiary a-small">{missingMap.join(", ")}: searched, but not placed on the map.</p>}
        <div className="a-row">
          <div className="a-micro">Team size</div>
          <div className="a-chips">
            <span className="a-chip a-range">
              <input type="number" min={1} value={size.min} aria-label="Minimum people" {...NO_AUTOFILL} onChange={(e) => onChange({ ...value, sizeRange: { ...size, min: Number(e.target.value) } })} />
              <span className="a-tertiary">to</span>
              <input type="number" min={1} value={size.max} aria-label="Maximum people" {...NO_AUTOFILL} onChange={(e) => onChange({ ...value, sizeRange: { ...size, max: Number(e.target.value) } })} />
              <span className="a-tertiary">people</span>
            </span>
          </div>
        </div>
        <ChipRow
          label="Sectors"
          items={sectors}
          placeholder={sectors.length ? "Add a sector" : "Any sector · add one"}
          onRemove={(x) => onChange({ ...value, sectors: sectors.filter((c) => c !== x) })}
          onAdd={(x) => onChange({ ...value, sectors: [...new Set([...sectors, x])] })}
        />
        {editable && (
          <div className="a-row">
            <div className="a-micro">Signs they will buy now</div>
            <div className="a-chips">
              {SIGNALS.map((s) => (
                <button key={s.id} className={`a-chip a-toggle ${signals.includes(s.id) ? "on" : ""}`} aria-pressed={signals.includes(s.id)} onClick={() => toggleSignal(s.id)}>
                  {signals.includes(s.id) && <Icon name="check" size={14} />}
                  {s.label}
                  {s.companyData && <span className="a-tertiary a-small">· company data</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="a-actions">
        <button className="a-btn primary" onClick={onFind} disabled={busy || !cities.length || (editable && !offer.trim())}>Find companies</button>
        {hasExample && <button className="a-btn secondary" onClick={onExample}>Use a saved example</button>}
        {hasExample && exampleNote && <span className="a-tertiary a-small">{exampleNote}</span>}
      </div>
    </section>
  );
}
