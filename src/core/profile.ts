// Signal-based profiles: a seller describes offer, buyer, cities, size, sectors and buying signals; everything
// the pipeline needs (discovery queries, research fields, gate-2 questions, action, drafts) is derived here.
// Explicit (older) profiles without `signals` pass through unchanged. Pure TypeScript.
import { isSignalId, questionOf, researchFieldOf, signalById, type SignalId } from "./signals";
import type { DecisionQuestion, Profile } from "./types";

/** What a seller writes. Everything else is derived. */
export interface ProfileSpec {
  id: string;
  name: string;
  /** One line for the preset card. */
  description: string;
  /** What you sell, as a noun phrase ("flexible workspace on monthly terms"). */
  offer: string;
  /** Who buys it, at company level ("growing tech companies with 10-200 people"). Never a person. */
  buyer: string;
  cities: string[];
  cityCoordinates?: Profile["cityCoordinates"];
  sizeRange: { min: number; max: number };
  sectors: string[];
  signals: SignalId[];
  reviewThreshold?: number;
  /** Plain names per action label. Defaults below. */
  actionLabels?: Record<string, string>;
  /** Placeholders: {offer} {company} {city} {signals}. Defaults below. */
  draftTemplates?: Record<string, string>;
  /** Optional discovery overrides; derived from offer and buyer otherwise. */
  discovery?: Partial<Profile["discovery"]>;
}

export const DEFAULT_ACTION_LABELS: Readonly<Record<string, string>> = {
  call_now: "Call this week",
  send_email: "Send an email",
  linkedin_touch: "Light touch",
  nurture: "Keep warm",
  discard: "Skip",
};

export const DEFAULT_DRAFTS: Readonly<Record<string, string>> = {
  call_now:
    "CALL NOTES: {company}\nWhy now:\n{signals}\nOpening line: \"We saw that {company} is moving in {city}. We offer {offer}, and teams in your situation usually need it now rather than in six months.\"\nAsk: what is changing for the team in {city} this quarter, and who decides on it.",
  send_email:
    "Subject: {company} in {city}\n\nHi {company} team,\n\nWe noticed:\n{signals}\n\nWe offer {offer}. If this is on your list for the coming months, would a 20-minute call next week be useful?\n\nBest regards",
  linkedin_touch:
    "LinkedIn (company page): congratulate {company} on recent news ({signals}) and mention that we offer {offer} in {city}. No hard ask.",
  nurture: "NURTURE: {company}. Fits the profile, no current signal. Re-check in 3 months.\nKnown so far:\n{signals}",
  discard: "SKIP: {company}. Reason from the evidence:\n{signals}",
};

export const DEFAULT_THRESHOLD = 0.55;
export const MAX_PER_CITY = { cala: 4, linkup: 2 } as const;

const GATE1: DecisionQuestion = {
  id: "profile_fit",
  instructions: "Using only the cheap company data, does this company plausibly fit the prospect profile (target city, size range, sector and buyer)? rule_check is a deterministic hint, not the answer.",
  options: {
    fit: { description: "Matches city, size and sector, or clearly close enough to research.", fixtureMatch: "rule_check: fit" },
    no_fit: { description: "Clearly outside the target city, size range or sector.", fixtureMatch: "rule_check: no_fit" },
    unknown: { description: "Not enough data to tell; worth a cheap research pass." },
  },
  plain: { fit: "Fits your profile", no_fit: "Outside your cities, team size or sectors", unknown: "Not enough information to tell" },
};

/** Built-in size check: always asked, from the profile's own range. */
function sizeQuestion(min: number, max: number): DecisionQuestion {
  return {
    id: "headcount_in_range",
    evidenceField: "headcount",
    instructions: `According to the evidence, does the company have between ${min} and ${max} employees?`,
    options: {
      yes: { description: `Headcount is between ${min} and ${max}.`, fixtureMatch: `\\b(\\d+) (employees|people|staff)` },
      no: { description: `Headcount is below ${min} or above ${max}.` },
      unknown: { description: "Not stated in the evidence." },
    },
    plain: { yes: "Right team size", no: "Team size outside your range", unknown: "Team size unknown" },
  };
}

function actionQuestion(offer: string): DecisionQuestion {
  return {
    id: "next_action",
    instructions: `The seller offers ${offer}. Given the profile, the evidence and the factual answers, what should the sales team do next with this company? Choose call_now only with strong, recent, sourced signals in a target city.`,
    options: {
      discard: { description: "Not a prospect: clearly outside the profile, or no plausible need for the offer.", fixtureMatch: "size_check: OUTSIDE" },
      call_now: { description: "Strong, recent signals (two or more, at least one in a target city): call this week.", fixtureMatch: "signal_strength: strong" },
      send_email: { description: "Clear signals but not urgent: send a tailored email.", fixtureMatch: "signal_strength: medium" },
      linkedin_touch: { description: "One or two weak signals: a light touch on the company page or a company post.", fixtureMatch: "signal_strength: weak" },
      nurture: { description: "Fits the profile but no current signal: re-check in 3 months.", fixtureMatch: "signal_strength: none" },
    },
    plain: {
      call_now: "Strong, recent signs they need what you sell now.",
      send_email: "Clear signs, but not urgent: a short email fits.",
      linkedin_touch: "A couple of weak signs: a light touch is enough.",
      nurture: "Fits your profile, but nothing is happening right now.",
      discard: "Not a prospect for you right now.",
    },
  };
}

function discoveryOf(s: ProfileSpec): Profile["discovery"] {
  return {
    linkupQuery:
      s.discovery?.linkupQuery ??
      `List up to {n} real companies with an office or team in {city} with roughly {min}-{max} employees, in these sectors: {sectors}. They should be likely buyers of ${s.offer} (typical buyer: ${s.buyer}). Prefer companies with recent news: funding, hiring, expansion or launches in the last 12 months. Company-level information only, no people.`,
    calaQuery:
      s.discovery?.calaQuery ??
      "Companies headquartered or with an office in {city}, between {min} and {max} employees, in sectors {sectors}, that raised funding in the last 12 months. Return name, website, city, employees, sector.",
    maxPerCity: s.discovery?.maxPerCity ?? { ...MAX_PER_CITY },
  };
}

/** Research query from the chosen signals: one clause per research field. */
function researchQuery(fields: Array<{ id: string; description: string }>): string {
  const asks = fields.map((f) => f.description.replace(/\.$/, "")).join("; ");
  return `Research the company {company} ({website}). Report only company-level facts with sources, never named individuals: ${asks}.`;
}

/** Turns a spec into a full Profile. Unknown signal ids are dropped. The spec is kept for run-only re-derivation. */
export function expandSpec(spec: ProfileSpec): Profile {
  const signals = [...new Set(spec.signals.filter(isSignalId))];
  const defs = signals.map((id) => signalById(id)!);
  const researched = defs.filter((d) => !d.companyData).map((d) => researchFieldOf(d, spec.cities));
  const fields = [...researched, { id: "headcount", description: "Approximate number of employees." }];
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    offer: spec.offer,
    buyer: spec.buyer,
    signals,
    cities: spec.cities,
    ...(spec.cityCoordinates ? { cityCoordinates: spec.cityCoordinates } : {}),
    sizeRange: spec.sizeRange,
    sectors: spec.sectors,
    discovery: discoveryOf(spec),
    gate1: GATE1,
    gate1Drop: ["no_fit"],
    research: { queryTemplate: researchQuery(fields), fields },
    gate2: [...defs.map(questionOf), sizeQuestion(spec.sizeRange.min, spec.sizeRange.max)],
    action: actionQuestion(spec.offer),
    reviewThreshold: spec.reviewThreshold ?? DEFAULT_THRESHOLD,
    actionLabels: { ...DEFAULT_ACTION_LABELS, ...spec.actionLabels },
    draftTemplates: { ...DEFAULT_DRAFTS, ...spec.draftTemplates },
    spec,
  };
}

/** A profile file: a signal spec (has `signals`) or an explicit older profile (passes through). */
export function expandProfile(raw: Profile | ProfileSpec): Profile {
  return Array.isArray((raw as ProfileSpec).signals) && !(raw as Profile).gate2 ? expandSpec(raw as ProfileSpec) : (raw as Profile);
}
