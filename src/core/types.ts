// Pure domain types. No framework imports: this folder ports as-is.
import type { ProfileSpec } from "./profile";
import type { SignalId } from "./signals";

export type ProviderMode = "live" | "fixture";

/** One option of a Jev "choice" question. */
export interface ChoiceOption {
  /** What the option means, sent to Jev as the criterion description. */
  description: string;
  /**
   * Fixture-only: regex (case-insensitive) tested against the question's input text.
   * Ignored in live mode. Lets fixture runs behave plausibly without a model.
   */
  fixtureMatch?: string;
}

export interface DecisionQuestion {
  id: string;
  instructions: string;
  /** label -> option */
  options: Record<string, ChoiceOption>;
  /** Labels that count as a positive buying signal (gate 2 only). */
  positive?: string[];
  /** Evidence field this question is mainly about (gate 2 only). */
  evidenceField?: string;
  /** Plain-language sentence per label for non-expert views. `{city}` is replaced. Optional. */
  plain?: Record<string, string>;
}

export interface ResearchField {
  id: string;
  description: string;
}

export interface Profile {
  id: string;
  name: string;
  description: string;
  /** One-sentence promise shown above the Simple view. Optional. */
  tagline?: string;
  /** Short hero headline for the Simple view (two lines at most). Optional. */
  headline?: string;
  /** Free text sent to Jev as the seller's offer. */
  offer: string;
  /** Who buys the offer, at company level. Signal-based profiles only. */
  buyer?: string;
  /** Buying-signal ids from the signal library. Signal-based profiles only. */
  signals?: SignalId[];
  /** Plain name per action label (Simple never shows raw labels). */
  actionLabels?: Record<string, string>;
  /** Loaded from profiles/private/ (gitignored, local only). Never shown as a preset card. */
  private?: boolean;
  /** The spec a signal-based profile was derived from (run-only edits re-derive from it). */
  spec?: ProfileSpec;
  cities: string[];
  /** City-level map positions (lat/lng) per entry in `cities`. Optional: without it the UI shows the SVG radar. */
  cityCoordinates?: Record<string, { lat: number; lng: number }>;
  sizeRange: { min: number; max: number };
  sectors: string[];
  discovery: {
    /** Natural-language query template. Placeholders: {city} {sectors} {min} {max} */
    linkupQuery: string;
    /** Cala knowledge/query input template. Same placeholders. */
    calaQuery: string;
    /** Companies per city per discovery source: one number for all, or per provider (e.g. { cala: 4, linkup: 2 }). */
    maxPerCity: number | Partial<Record<"cala" | "linkup", number>>;
  };
  gate1: DecisionQuestion;
  /** Gate-1 labels that drop the company. */
  gate1Drop: string[];
  research: {
    /** Placeholders: {company} {website} {cities} */
    queryTemplate: string;
    fields: ResearchField[];
  };
  gate2: DecisionQuestion[];
  action: DecisionQuestion;
  /** If the top action probability is below this, route to human review. */
  reviewThreshold: number;
  /** action label -> template. Placeholders: {company} {city} {signals} {offer} {offer_name} */
  draftTemplates: Record<string, string>;
}

export interface Company {
  name: string;
  website?: string;
  city?: string;
  country?: string;
  employees?: number;
  sector?: string;
  description?: string;
  discoveredBy: "fixture" | "cala" | "linkup" | "manual" | "seed";
  /** Every discovery source that returned this company (set when more than one ran). */
  foundBy?: Array<"fixture" | "cala" | "linkup" | "manual" | "seed">;
  /** Where `employees` came from, when not discovery (e.g. "apollo"). */
  employeesSource?: "apollo";
  /** Discovery sources that mention this company, when the provider returns any. */
  sources?: Source[];
}

export interface Source {
  name: string;
  url: string;
  /** Icon URL exactly as the provider returned it (Linkup `favicon`), when it is https. */
  favicon?: string;
}

export interface Evidence {
  mode: ProviderMode;
  fields: Record<string, string | null>;
  sources: Source[];
  /** How many sources the research consulted, when `sources` was trimmed (saved examples keep cited ones only). */
  consulted?: number;
  error?: string;
}

/** Company-level enrichment (org data only). Fields are an allowlisted subset of the provider response. */
export interface Enrichment {
  source: "apollo";
  mode: ProviderMode;
  domain: string;
  /** False when the provider's organization name did not match the company: no fields are kept then. */
  matched: boolean;
  /** True when served from the local cache (no credit spent). */
  cached?: boolean;
  fields: {
    name?: string;
    estimated_num_employees?: number;
    industry?: string;
    city?: string;
    street_address?: string | null;
    postal_code?: string | null;
    country?: string;
    raw_address?: string | null;
    total_funding_printed?: string | null;
    latest_funding_round_date?: string | null;
    latest_funding_stage?: string | null;
    funding_events?: Array<{ date?: string; type?: string; amount?: string; currency?: string }>;
    organization_headcount_six_month_growth?: number | null;
    organization_headcount_twelve_month_growth?: number | null;
    organization_headcount_twenty_four_month_growth?: number | null;
  };
  /** Geocoded office, only when the address resolved to a street address in a target city. */
  location?: { lat: number; lng: number; precision: "address"; query: string };
  fetchedAt: string;
}

export interface EnrichmentProvider {
  readonly mode: ProviderMode;
  /** Null when the company has no usable domain. Throws on provider errors. */
  enrich(company: Company, profile: Profile): Promise<Enrichment | null>;
  /** Headcount already known from an earlier enrichment (local cache, no call). */
  knownEmployees?(company: Company): number | undefined;
}

export interface Answer {
  questionId: string;
  question: string;
  choice: string;
  probability: number;
  probabilities: Record<string, number>;
}

export type Stage =
  | "discovered"
  | "dropped_gate1"
  | "passed_gate1"
  | "researched"
  | "actioned"
  | "review"
  | "error";

/** The exact decision call made for one step: request sent and raw answers returned. No keys. */
export interface DecisionTrace {
  mode: ProviderMode;
  /** "jev" for a real Jev call; "fixture-heuristic" when no model was called. */
  engine: "jev" | "fixture-heuristic";
  model?: string;
  state: string;
  /** The `questions` object as sent (or as it would be sent, for the fixture). */
  questions: Record<string, unknown>;
  /** Raw `answers` object returned (fixture: the heuristic's output). */
  answers: unknown;
  /** How Jev was reached, when live. */
  route?: "openrouter" | "typesafe-direct";
  /** Provider-reported usage, when live (OpenRouter adds `cost`). */
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
  ms: number;
  at: string;
  /** True in a shareable saved example: state, questions and raw answers were left out. */
  omitted?: boolean;
}

export type DecisionStep = "gate1" | "gate2" | "action";

export interface CompanyResult {
  company: Company;
  stage: Stage;
  gate1?: Answer;
  evidence?: Evidence;
  gate2: Answer[];
  signalStrength?: string;
  action?: Answer;
  finalAction?: string;
  draft?: string;
  error?: string;
  /** Company-level enrichment (Apollo), when it ran. */
  enrichment?: Enrichment;
  /** Last decision call per step, for "Show the Jev call". */
  traces?: Partial<Record<DecisionStep, DecisionTrace>>;
  /** Wall-clock ms of the non-decision steps (decision latency is in each trace). */
  timings?: { research?: number; enrichment?: number };
}

export interface StageCounts {
  discovered: number;
  passedGate1: number;
  researched: number;
  actioned: number;
  review: number;
  dropped: number;
  errors: number;
}

export interface RunInput {
  profileId: string;
  /** "fixture" = built-in sample companies; "cala" / "linkup" = live discovery; "both" = Linkup and Cala in parallel; "manual" = names below. */
  discovery: "fixture" | "cala" | "linkup" | "both" | "manual";
  companyNames?: string[];
  seed?: Company[];
  limit?: number;
  /** Run-only edits of the profile (never written to the profile file). Recorded for the evidence trail. */
  profileOverride?: ProfileOverride;
  /** True only when the user ticked "Fixtures only" (or chose sample companies). Live runs never mix in fixtures. */
  fixturesOnly?: boolean;
}

export interface ProfileOverride {
  offer?: string;
  buyer?: string;
  signals?: SignalId[];
  cities?: string[];
  sizeRange?: { min: number; max: number };
  sectors?: string[];
}

export interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  input: RunInput;
  profile: Pick<Profile, "id" | "name" | "reviewThreshold">;
  providers: { jev: ProviderMode; linkup: ProviderMode; cala: ProviderMode };
  counts: StageCounts;
  results: CompanyResult[];
  notes: string[];
  /** Every pipeline event in order, with `t` = ms since run start. Lets a run be replayed. */
  events?: TimedEvent[];
}

// ---- Live pipeline events (streamed as NDJSON by the app) ----

export type DiscoverySource = "fixture" | "cala" | "linkup" | "manual" | "seed";

/** What one discovery query did: exact query text, result count, latency. */
export interface DiscoveryReport {
  /** "sent" right before the call (count/ms are 0), "done" after it returns or fails. */
  status: "sent" | "done";
  provider: DiscoverySource;
  mode: ProviderMode;
  query: string;
  city?: string;
  count: number;
  ms: number;
  error?: string;
}

export type PipelineEvent =
  | { type: "run_started"; profile: RunRecord["profile"]; providers: RunRecord["providers"]; input: RunInput }
  | { type: "discovery_query"; provider: DiscoverySource; mode: ProviderMode; query: string; city?: string }
  | ({ type: "discovery_done" } & Omit<DiscoveryReport, "status">)
  | { type: "company_discovered"; index: number; company: Company }
  | { type: "decision_started"; index: number; step: DecisionStep; questions: string[]; engine: "jev" | "fixture-heuristic" }
  | { type: "gate1"; index: number; answer: Answer; dropped: boolean; trace?: DecisionTrace }
  | { type: "enrichment_done"; index: number; enrichment: Enrichment | null; ms: number; error?: string }
  | { type: "research_started"; index: number }
  | { type: "research_done"; index: number; evidence: Evidence; ms: number }
  | { type: "gate2"; index: number; answers: Answer[]; signalStrength?: string; trace?: DecisionTrace }
  | { type: "action"; index: number; answer: Answer; trace?: DecisionTrace }
  | { type: "routed"; index: number; routed: "actioned" | "review"; finalAction: string; reason: string }
  | { type: "company_done"; index: number; result: CompanyResult }
  | { type: "run_finished"; runId: string; counts: StageCounts; file?: string; notes: string[]; providers?: RunRecord["providers"] }
  | { type: "note"; message: string }
  /** Keeps a quiet stream alive; carries no data and is never stored. */
  | { type: "heartbeat" }
  | { type: "error"; index?: number; message: string };

export type TimedEvent = PipelineEvent & { t: number };

// ---- Provider interfaces (implemented in src/providers/*) ----

export interface DecisionProvider {
  readonly mode: ProviderMode;
  /** One subject (one company) per call. Returns answers keyed by question id. */
  decide(state: string, questions: DecisionQuestion[], onTrace?: (t: DecisionTrace) => void): Promise<Record<string, Answer>>;
}

export interface ResearchProvider {
  readonly mode: ProviderMode;
  research(company: Company, profile: Profile): Promise<Evidence>;
}

export interface DiscoveryProvider {
  readonly mode: ProviderMode;
  readonly name: "fixture" | "cala" | "linkup";
  /** `report` is called once per query sent (exact text, count, latency). */
  discover(profile: Profile, limit: number, report?: (r: DiscoveryReport) => void): Promise<Company[]>;
}
