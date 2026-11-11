// Buying-signal library. Pure TypeScript: a profile lists signal ids; the research fields, the gate-2
// questions and the plain ticks are derived from here. Company-level facts only, never people.
import type { DecisionQuestion, ResearchField } from "./types";

export type SignalId =
  | "funding_recent"
  | "hiring_in_target_cities"
  | "expansion_or_new_office"
  | "new_product_or_market"
  | "headcount_growing_12m"
  | "work_policy_hybrid"
  | "leadership_change"
  | "regulatory_or_compliance_trigger";

export interface Signal {
  id: SignalId;
  /** Plain label for chips ("Raised funding recently"). */
  label: string;
  /** Research field. `{cities}` in the description is replaced by the profile's cities. */
  field: ResearchField;
  /** True when the field comes from company data (Apollo), not from web research. */
  companyData?: boolean;
  /** Jev question: yes / no / unknown, "yes" is the positive buying signal. */
  question: string;
  /** Option descriptions sent to Jev. */
  yes: string;
  no: string;
  /** Fixture-only regexes (case-insensitive), tested against the evidence line. */
  fixtureMatch: { yes: string; no: string };
  /** Evidence-tick text per answer. `{city}` is replaced by the company's target city. */
  tick: { yes: string; no: string; unknown: string };
  /** A fact counts as a signal only within this many months of the reference date. */
  recencyMonths?: number;
}

const RECENT = 12;

export const SIGNALS: ReadonlyArray<Signal> = [
  {
    id: "funding_recent",
    label: "Raised funding recently",
    field: { id: "funding_last_12_months", description: "Funding raised in the last 12 months: amount, round, date. If the last round is older, give its date." },
    question: "According to the evidence, did the company raise funding within the 12 months before the reference date? A round older than 12 months is no.",
    yes: "Evidence states a funding round dated within the last 12 months.",
    no: "Evidence states no recent funding, or the last round is older than 12 months.",
    fixtureMatch: { yes: "(?<!no )(raised|series [a-e]|seed round|funding round)", no: "no (recent |disclosed )?funding|bootstrapped" },
    tick: { yes: "Raised funding recently", no: "No recent funding found", unknown: "Funding unknown" },
    recencyMonths: RECENT,
  },
  {
    id: "hiring_in_target_cities",
    label: "Hiring in your cities",
    field: { id: "hiring_in_target_cities", description: "Open roles or hiring activity in {cities}." },
    question: "According to the evidence, is the company hiring in one of the target cities?",
    yes: "Evidence shows open roles or active hiring in a target city.",
    no: "Evidence says no hiring there, or hiring only elsewhere.",
    fixtureMatch: { yes: "(?<!(not|no) )(hiring|open roles|recruiting)", no: "not hiring|no open roles|hiring freeze" },
    tick: { yes: "Hiring in {city}", no: "Not hiring in {city}", unknown: "Hiring in {city} unknown" },
  },
  {
    id: "expansion_or_new_office",
    label: "Expanding or opening an office",
    field: { id: "office_or_expansion", description: "New office, opening or expansion in {cities} in the last 12 months." },
    question: "According to the evidence, is the company opening or expanding an office in a target city (within the last 12 months or announced)?",
    yes: "Evidence describes a new office, opening or expansion in a target city.",
    no: "Evidence says no expansion there.",
    fixtureMatch: { yes: "(?<!no (announced )?)(new office|opening|expan|relocat)", no: "no (announced )?(expansion|new office)" },
    tick: { yes: "Expanding in {city}", no: "No new office in {city}", unknown: "Expansion unknown" },
    recencyMonths: RECENT,
  },
  {
    id: "new_product_or_market",
    label: "New product or market",
    field: { id: "new_product_or_market", description: "A new product launch or entry into a new market or country in the last 12 months." },
    question: "According to the evidence, did the company launch a new product or enter a new market within the last 12 months?",
    yes: "Evidence describes a launch or a new market within the last 12 months.",
    no: "Evidence says nothing new launched, or the launch is older than 12 months.",
    fixtureMatch: { yes: "(?<!no )(launch|new market|entered|new product)", no: "no (new )?(launch|product|market)" },
    tick: { yes: "Launched something new", no: "No recent launch", unknown: "Launches unknown" },
    recencyMonths: RECENT,
  },
  {
    id: "headcount_growing_12m",
    label: "Team grew this year",
    field: { id: "apollo_headcount_growth_12m", description: "Headcount change over the last 12 months (company data)." },
    companyData: true,
    question: "Using ONLY the apollo_headcount_growth_12m line in the 'Company data (Apollo)' block, did the company's headcount grow over the last 12 months? If that line is absent, answer unknown.",
    yes: "Headcount grew over the last 12 months.",
    no: "Headcount stayed flat or shrank over the last 12 months.",
    fixtureMatch: { yes: "grew", no: "shrank" },
    tick: { yes: "Team grew in the last year", no: "Team did not grow in the last year", unknown: "Team growth unknown" },
    recencyMonths: RECENT,
  },
  {
    id: "work_policy_hybrid",
    label: "Works hybrid",
    field: { id: "work_policy", description: "Stated work policy: hybrid, fully remote or office-first." },
    question: "According to the evidence, does the company work hybrid (some days in an office, some remote)?",
    yes: "Evidence states a hybrid policy.",
    no: "Evidence states fully remote or office-first.",
    fixtureMatch: { yes: "hybrid", no: "fully remote|remote-first|remote first|office-first|in-office|five days" },
    tick: { yes: "Works hybrid", no: "Not hybrid", unknown: "Work policy unknown" },
  },
  {
    id: "leadership_change",
    label: "New leadership",
    field: { id: "leadership_change", description: "A company-level leadership change in the last 12 months (new CEO, country manager or head of a function). The role and the date only, never the person's name." },
    question: "According to the evidence, did the company have a leadership change (a new CEO, country manager or head of a function) within the last 12 months?",
    yes: "Evidence describes a new leader in a key role within the last 12 months.",
    no: "Evidence says no change, or the change is older than 12 months.",
    fixtureMatch: { yes: "(?<!no )(new (ceo|cfo|cto|coo|head|country manager)|appointed)", no: "no (leadership )?change" },
    tick: { yes: "New leadership this year", no: "No leadership change", unknown: "Leadership changes unknown" },
    recencyMonths: RECENT,
  },
  {
    id: "regulatory_or_compliance_trigger",
    label: "Regulation or compliance deadline",
    field: { id: "regulatory_trigger", description: "A new regulation, compliance deadline, licence or audit affecting the company, in the last or next 12 months." },
    question: "According to the evidence, is the company affected by a new regulation, licence or compliance deadline within 12 months of the reference date?",
    yes: "Evidence names a regulation, licence or deadline that affects the company now.",
    no: "Evidence says no such trigger.",
    fixtureMatch: { yes: "(?<!no )(regulat|compliance|licen[cs]e|audit|deadline)", no: "no (regulatory|compliance)" },
    tick: { yes: "Facing a regulation or deadline", no: "No regulatory trigger", unknown: "Regulatory triggers unknown" },
    recencyMonths: RECENT,
  },
];

export const SIGNAL_IDS: ReadonlyArray<SignalId> = SIGNALS.map((s) => s.id);

export function signalById(id: string): Signal | undefined {
  return SIGNALS.find((s) => s.id === id);
}

export const isSignalId = (x: unknown): x is SignalId => typeof x === "string" && SIGNAL_IDS.includes(x as SignalId);

const fillCities = (s: string, cities: string[]) => s.replaceAll("{cities}", cities.join(" and ") || "the target cities");

/** Research field for a signal, with the profile's cities filled in. */
export function researchFieldOf(s: Signal, cities: string[]): ResearchField {
  return { id: s.field.id, description: fillCities(s.field.description, cities) };
}

/** Gate-2 question for a signal: yes / no / unknown, "yes" positive. The question id is the signal id. */
export function questionOf(s: Signal): DecisionQuestion {
  return {
    id: s.id,
    evidenceField: s.field.id,
    instructions: s.question,
    positive: ["yes"],
    options: {
      yes: { description: s.yes, fixtureMatch: s.fixtureMatch.yes },
      no: { description: s.no, fixtureMatch: s.fixtureMatch.no },
      unknown: { description: "Not stated in the evidence." },
    },
    plain: { ...s.tick },
  };
}

const MONTH_MS = 30.44 * 24 * 3600 * 1000;

/**
 * Recency rule: true when `dateIso` lies within `months` before `refIso` (a future date counts as recent).
 * False when the date is unparseable.
 */
export function isRecent(dateIso: string | null | undefined, refIso: string, months = RECENT): boolean {
  const d = Date.parse(dateIso ?? "");
  const ref = Date.parse(refIso);
  if (!Number.isFinite(d) || !Number.isFinite(ref)) return false;
  return ref - d <= months * MONTH_MS;
}

/** Fixture-only: which answer a signal's patterns give for an evidence line. */
export function fixtureAnswer(s: Signal, text: string | null | undefined): "yes" | "no" | "unknown" {
  if (!text) return "unknown";
  const yes = new RegExp(s.fixtureMatch.yes, "i").test(text);
  const no = new RegExp(s.fixtureMatch.no, "i").test(text);
  if (yes && !no) return "yes";
  if (no) return "no";
  return "unknown";
}
