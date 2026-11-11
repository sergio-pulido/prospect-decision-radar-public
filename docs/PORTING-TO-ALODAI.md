# Porting notes: Prospect Decision Radar → Alodai

Input for Alodai's design gate. This is a hackathon proof of concept (its own repo by exception); in Alodai it becomes a
generic capability, not a client-specific feature. Evidence levels follow Alodai's vocabulary: **implemented** = merged
with unit tests green; **verified** = run by a human on a real stack. Nothing here is "proven" yet (no dated artifact
beyond the run files and screenshots in this repo). Measurements are from two live runs on 2026-11-10/11 unless noted.

---

## 1. Architecture

```
src/core/        pure TypeScript, no framework imports (ports as-is)
src/providers/   one adapter per provider + a session call budget (Node only)
src/server/      request parsing for the API routes
src/app/         Next.js: API routes, Simple view (3 steps), Pro view
profiles/        presets (signal-based specs); profiles/private/ is gitignored
fixtures/        fictional sample companies + research; demo-run.json = keyless saved example
runs/            one JSON evidence trail per run (gitignored), call ledger, Apollo cache
```

Providers are injected into the pipeline (`PipelineDeps`), so Alodai can replace each adapter with its own
integration layer without touching `src/core`.

### Pure modules and their public functions

| Module | Public functions / values | Tests |
| --- | --- | --- |
| `core/types.ts` | `Profile`, `ProfileOverride`, `Company`, `Source`, `Evidence`, `Enrichment`, `Answer`, `CompanyResult`, `RunInput`, `RunRecord`, `PipelineEvent`, `TimedEvent`, `DecisionTrace`, provider interfaces (`DecisionProvider`, `ResearchProvider`, `DiscoveryProvider`, `EnrichmentProvider`) | type-checked |
| `core/pipeline.ts` | `runPipeline(input, profile, deps, providers)`, `discover`, `redecide` (counterfactual), `dedupe`, `normName`, `countStages`, `routeReason` | `discovery.test.ts`, `enrichment.test.ts` |
| `core/signals.ts` | `SIGNALS`, `SIGNAL_IDS`, `signalById`, `isSignalId`, `researchFieldOf`, `questionOf`, `isRecent`, `fixtureAnswer` | `signals.test.ts` (6) |
| `core/profile.ts` | `expandSpec(spec)`, `expandProfile(raw)`, `DEFAULT_ACTION_LABELS`, `DEFAULT_DRAFTS`, `DEFAULT_THRESHOLD` | `profile.test.ts` (7, incl. "old explicit profile still loads") |
| `core/state.ts` | `gate1State`, `gate2State`, `actionState`, `ruleCheck`, `signalStrength`, `sizeCheck`, `setReferenceDate` | via `plain.test.ts`, `profile.test.ts` |
| `core/plain.ts` | `BUCKETS`, `bucketOf`, `confidenceOf`, `actionName`, `evidenceTicks`, `cardTicks`, `companyDataTicks`, `reviewReason`, `reviewVerdict`, `cardState`, `progressOf`, `sizeNote`, `briefing`, `listOrder`, `faviconFor`, `companyFavicon`, `firstUrl` | `plain.test.ts` (17) |
| `core/override.ts` | `parseOverride(untrusted)`, `applyOverride(profile, override)` | `override.test.ts`, `profile.test.ts` |
| `core/enrichment.ts` | `enrichmentEvidence`, `knownHeadcount`, `latestFunding`, `growthPct`, `APOLLO_FIELDS` | `enrichment.test.ts` |
| `core/fixture-run.ts` | `toFixtureRun(run, id)`: derived fields only, for shareable examples | `fixture-run.test.ts` |
| `core/draft.ts` | `buildDraft(profile, action, company, evidence, answers)` | `profile.test.ts` |
| `core/cities.ts` | `KNOWN_CITIES`, `cityCoordinates(name)` | `profile.test.ts` |
| `core/io.ts` (Node) | `listProfiles`, `loadProfile`, `saveRun`, `loadRun`, `listRuns`, `runBuckets`, `PRESET_ORDER` | `plain.test.ts` |

| `core/dossier.ts` | `parseCitations`, `groupSources`, `isPersonalProfile`, `stripPersonalLinks`, `fieldText`, `recencyOf`, `latestDate`, `whatPushed`, `couldNotFind`, `wouldChange`, `whySentence`, `decisionPath`, `slugOf`, `decodeEntities` | `dossier.test.ts` (15) |
| `core/timeout.ts` | `withTimeout`, `TimeoutError`, `DEFAULT_TIMEOUTS`, `HTTP_TIMEOUT_MS` | `pipeline.test.ts` (4: hanging research, hanging discovery, failing save) |

`pnpm test`: 66 tests, all green at the time of writing.

---

## 2. Event model (NDJSON, `POST /api/run/stream`)

Every event is also stored in the run record with `t` = ms since run start, which makes any run replayable.

| Event | Fields |
| --- | --- |
| `run_started` | `profile {id, name, reviewThreshold}`, `providers {jev, linkup, cala}` (`live`/`fixture`), `input` (`RunInput`) |
| `discovery_query` | `provider`, `mode`, `query` (exact text sent), `city?` |
| `discovery_done` | `provider`, `mode`, `query`, `city?`, `count`, `ms`, `error?` |
| `company_discovered` | `index`, `company` |
| `decision_started` | `index`, `step` (`gate1`/`gate2`/`action`), `questions` (ids), `engine` (`jev`/`fixture-heuristic`) |
| `gate1` | `index`, `answer`, `dropped`, `trace?` |
| `enrichment_done` | `index`, `enrichment` (or null), `ms`, `error?` |
| `research_started` | `index` |
| `research_done` | `index`, `evidence {mode, fields, sources}`, `ms` |
| `gate2` | `index`, `answers[]`, `signalStrength?`, `trace?` |
| `action` | `index`, `answer`, `trace?` |
| `routed` | `index`, `routed` (`actioned`/`review`), `finalAction`, `reason` |
| `company_done` | `index`, `result` (`CompanyResult`) |
| `note` | `message` (e.g. a source stopped, a key rejected) |
| `heartbeat` | none. Sent by the stream route every 5 s so a long silent provider call cannot idle the connection out; never stored |
| `error` | `index?`, `message` |
| `run_finished` | `runId`, `counts`, `file?`, `notes`, `providers?`. Always the last event: emitted by the pipeline from a `finally` block, after the optional `persist` step |

`Answer` = `{questionId, question, choice, probability, probabilities{label: p}}`. `DecisionTrace` = the exact Jev
request (`state`, `questions`) and raw `answers`, `model`, `route`, `usage {input_tokens, output_tokens, cost}`, `ms`.

### Run record (`runs/<timestamp>_<profile>.json`)

`{ id, startedAt, finishedAt, input (incl. run-only profileOverride), profile {id, name, reviewThreshold}, providers,
counts {discovered, passedGate1, researched, actioned, review, dropped, errors}, results[] (company, stage, gate1,
enrichment, evidence, gate2[], signalStrength, action, finalAction, draft, traces), notes[], events[] }`.

Counterfactual: `POST /api/decide { runId, index, removed[] }` re-asks gate 2 and the action with those evidence fields
set to null (2 Jev calls). Only removal is possible, never editing or adding evidence.

---

## 3. Providers

Measured on 2026-11-10/11 (run 1: `workspace`, 2 cities, 10 companies; run 2: `b2b-software-smb`, 1 city, 6 companies).

### Jev by TypeSafe, via OpenRouter (decisions)

- Endpoint: `POST https://openrouter.ai/api/v1/systemone` (System One-compatible). Auth: `Authorization: Bearer <key>`
  (`JEV_API_KEY_OPENROUTER`). TypeSafe direct (`https://api.typesafe.ai/v1/systemone`) only with `JEV_USE_TYPESAFE_DIRECT=1`.
- Request: `{ model: "typesafe/jev-1.14", state: <plain text>, questions: { <id>: { type: "choice", instructions, criteria: { <label>: <description> } } } }`.
- Response fields used: `model` (served: `typesafe/jev-1.14-20261014`), `answers.<id>.{type, choice, confidence,
  probabilities}`, `usage.{input_tokens, output_tokens, cost}`. A `refusal` answer leaves the question unanswered.
- Calls per company: 3 (gate 1, gate 2 with all signal questions in one call, action). 30 calls for 10 companies.
- Latency (run 1, n = 10 per step): gate 1 median 202 ms (max 420), gate 2 median 206 ms, action median 214 ms.
- Input size: gate 1 ~600 tokens, gate 2 ~1,700, action ~1,500.
- Cost (OpenRouter `usage.cost`, USD): run 1 $0.001599 for 30 calls → **$0.00016 per company**; run 2 $0.001003 for
  18 calls → $0.00017 per company.
- Failure: 429/5xx retried 3× with backoff; 401/403 marks the key rejected (hashed, in memory) and the decider falls
  back to the fixture heuristic, labelled "not Jev" in the UI and recorded in `providers.jev`.

### Linkup (discovery and research)

- Endpoint: `POST https://api.linkup.so/v1/search`. Auth: `Authorization: Bearer <key>`.
- Request: `{ q, depth: "standard", outputType: "structured", structuredOutputSchema: <JSON schema string>, includeSources: true }`.
- Response fields used: `data` (the structured object), `sources[].{name, url, favicon, type}` (`type: "image"` dropped;
  `content` used only to match discovery sources to a company, never stored). `favicon` is stored as returned, https only.
- Calls: 1 per city for discovery (2 companies per city), 1 per surviving company for research. Run 1: 12 calls.
- Latency: discovery 3.8–4.4 s; research median 6.9 s, p90 8.4 s, max 8.7 s.
- Cost per company: 1 standard search. The response carries no price; the per-call price depends on the Linkup plan
  and was **not measured**.
- Sources per company: 20–119 (median ~100). Only the cited ones are kept in shareable fixtures.
- Failure: HTTP error → that company is marked errored (it still shows, as "couldn't check"); a discovery failure stops
  that source with a note. A live run never falls back to sample companies.

### Cala (company-data discovery)

- Endpoint: `POST https://api.cala.ai/v1/knowledge/query`. Auth: header `X-API-KEY`.
- Request: `{ input: <natural-language query per city> }`.
- Response fields used: `results[].{name, website, city, employees ("~150–200" parsed to a number), sector}`.
- Calls: 1 per city (4 companies per city). Latency: 0.5 s (run 1, both cities) and **55 s** (run 2): highly variable.
- Cost: not reported by the API; not measured.
- Failure: stops that source with a note; the run continues with the other source.

### Apollo (optional company enrichment)

- Endpoint: `GET https://api.apollo.io/api/v1/organizations/enrich?domain=<domain>`. Auth: header `x-api-key`.
  No people or contact endpoint is ever called.
- Field allowlist (everything else is dropped before storage): `name, primary_domain, estimated_num_employees, industry,
  city, street_address, postal_code, country, raw_address, total_funding_printed, latest_funding_round_date,
  latest_funding_stage, funding_events[{date, type, amount, currency}], organization_headcount_{six,twelve,twenty_four}_month_growth`.
  Investor names are not kept (they can name people).
- Name check: if the organization behind the domain does not match the company name, nothing is kept.
- Calls: 1 per surviving company with a website, cached by domain in `runs/apollo-cache.json`. Run 1: 4 calls, 6 lookups
  (2 cache hits). Latency median 290 ms, max 646 ms. Credits: 1 call per new domain; credit price per plan not measured.
- Failure: 401/403 turns Apollo off for the process with one note; any other error skips enrichment for that company.

### Mapbox (maps and geocoding)

- Maps: `mapbox-gl` 3.34 with the public `pk.` token, style `light-v11`.
- Geocoding: `GET https://api.mapbox.com/search/geocode/v6/forward?q=<office address>&limit=1&proximity=<city>&access_token=<pk>`.
  A point is kept only for `feature_type: "address"` with `exact`/`high` confidence within 40 km of the target city.
- Calls: 1 per enriched company with a street address in a target city. Run 2: 2 calls. Cost: within the free tier at
  this volume (not metered by the app beyond the call count).
- Failure: any error keeps the city-level pin.

### Time limits (`core/timeout.ts`)

Every provider call has two limits: the HTTP request is aborted (`AbortSignal.timeout`: Linkup 55 s, Cala 85 s,
Jev 20 s per attempt, Apollo 15 s, geocoding 10 s) and the pipeline step is raced against a timer (discovery 90 s,
research 60 s, decision 30 s, enrichment 20 s), which also covers injected providers. A timeout fails that company
(an `error` event, "Couldn't check this one") or that discovery source (a note); the run always continues and ends.

### Caps (`runs/call-ledger.json`, shared by the dev server and scripts)

Jev 400, Linkup 200, Cala 60, Apollo 40, geocoding 100 calls per session (env `CAP_*`). Above a cap the call throws
"budget reached: use Replay". The ledger also sums Jev `usage.cost`.

### Cost of one live search (run 1, 10 companies, 2 cities)

30 Jev calls ($0.0016) · 12 Linkup searches · 2 Cala queries · 4 Apollo lookups · 0–2 geocodes · 31.6 s wall clock
with concurrency 3.

---

## 4. Decision design

- **One company per decision call.** Jev never compares companies; each call has one subject, so a decision can be
  explained and re-asked on its own.
- **Gate 1 (fit)**: cheap discovery data plus a deterministic `rule_check` hint (city, size, sector; an empty sector list
  means "any"). Options `fit / no_fit / unknown`; `no_fit` is dropped.
- **Gate 2 (facts)**: one yes / no / unknown question per selected signal, all in one call, answered "only from the
  evidence; if it is not stated, choose unknown". Plus a built-in size question generated from the profile's range.
  Signals and their questions:

  | Signal | Research field | Question (short) | Recency |
  | --- | --- | --- | --- |
  | `funding_recent` | `funding_last_12_months` | funding within 12 months of the reference date? | 12 months |
  | `hiring_in_target_cities` | `hiring_in_target_cities` | hiring in a target city? | |
  | `expansion_or_new_office` | `office_or_expansion` | opening or expanding an office in a target city? | 12 months |
  | `new_product_or_market` | `new_product_or_market` | launched a product or entered a market? | 12 months |
  | `headcount_growing_12m` | `apollo_headcount_growth_12m` (company data) | headcount grew in 12 months (Apollo line only)? | 12 months |
  | `work_policy_hybrid` | `work_policy` | works hybrid? | |
  | `leadership_change` | `leadership_change` (role and date only, never a name) | new CEO / country manager / head of a function? | 12 months |
  | `regulatory_or_compliance_trigger` | `regulatory_trigger` | affected by a regulation, licence or deadline? | 12 months |

- **Jev state**: seller offer, typical buyer, cities, size, sectors, the signals the seller looks for and a
  **reference date**, then the company block and the evidence fields. Sources are listed **by domain only**: titles
  and URL paths restate facts, which would let the decision see evidence that a counterfactual had removed.
- **Signal strength**: positives counted only when the model is ≥ 50% on a positive label: ≥ 4 strong, 3 medium,
  1–2 weak, 0 none. It is given to the action call as context, together with evidence coverage and the size check.
- **Size check**: Apollo's headcount (when known and > 0) replaces the discovery estimate everywhere, and the action
  state says `size_check: OUTSIDE the target size range: bigger (760 employees, Apollo; target 10-200)`.
- **Action**: `call_now / send_email / linkedin_touch / nurture / discard`. If the top probability is below the
  profile's `reviewThreshold` (default 0.55), the company is routed to human review ("Check yourself"). The threshold
  is a policy: Pro can move it and re-route from stored probabilities with no new calls.
- **Counterfactual (What-if)**: remove evidence fields, re-ask gate 2 + action (2 calls), show before/after. In a live
  rehearsal, removing only the funding sentence moved a company from call_now 96% to send_email 74%.
- **Drafts**: templates with `{offer} {company} {city} {signals}`, filled only with positive, sourced evidence lines.
  Never sent.

---

## 5. UX

### Simple (3 steps, one primary action each)

1. **What you sell**: hero "Know who to sell to next." / "Find the companies most likely to buy from you now, and why."
   Heading "What do you sell, and to whom?". Five preset cards (title + one line), then editable offer, buyer, cities,
   team size, sectors and signal chips. Edits apply to this search only (run-only override, recorded in the run).
   Buttons: **Find companies**, **Use a saved example** (with the example's preset and column counts beside it).
2. **Who we found**: counters (found · checked · decided), a list that settles into Call → Email/Light touch →
   Check yourself → Not now, then by confidence; rows show "sector · team size · city" and an outcome dot with a
   confidence word. **See what to do** sits right in the list header and lights up when every company is decided.
   Right column: one map per city, stacked and sticky.
3. **What to do**: a briefing headline naming the first action with companies ("Call 2 companies this week."), then
   four equal columns of equal-height cards: verdict, confidence meter, up to three evidence ticks with source chips
   (favicon + domain), Draft, "Why not sure?" (review cards), "How the AI decided ↗" (opens Pro on that company).
   Cards fly from their step-2 rows into the columns (FLIP).

### Pro

Setup (preset, discovery source, pasted names, seed JSON, limit, fixtures-only, replay picker with ★ examples and
column counts), provider badges (live / FIXTURE, decider "not Jev" in fixture mode), map stage or SVG radar, funnel,
event log, decision-policy slider, board or table, detail drawer with Jev bars per question, the threshold line, the
exact Jev call, and the What-if.

### Company dossier

One component for Simple and Pro (`src/app/dossier/`), opened from a step-3 card, a step-2 row, a map pin, or a Pro
board/table selection. A right-side sheet, 720 px wide (full screen under 900 px), with a deep link
`?company=<slug>` (optionally `&run=<id>`: the saved example is replayed quickly and the company opens). ← / → move
through companies in step-2 order, Esc closes.

- **Header**: favicon or neutral monogram, name, website, city · sector · team size with its source (Apollo or web),
  the outcome pill, the confidence meter with the threshold tick, and one sentence on why
  ("Call this week: raised Series A in Jun 2026 and is hiring in Barcelona").
- **Why**: the decision path with real durations (Found → Fits your profile → Researched → Decided, and where it
  stopped), "What pushed it here" (2–4 drivers, positive signals or blockers such as "Bigger than your range", each
  with its evidence sentence and source chips), "What we couldn't find", "What would change it" (a stored What-if, or
  the profile's buying signals that came back unknown).
- **Evidence**: one row per question, every option's probability, recency where a rule applies ("Feb 2026 · within
  12 months"), the full research text with numbered citation chips.
- **Company data**: Apollo facts (headcount, growth 6/12/24 months, industry, HQ, rounds as a table) and discovery
  facts with the exact queries; every value with its source.
- **Sources**: consulted vs cited, grouped by domain, "Cited only" by default.
- **How the AI decided**: per step the engine and model, latency, cost and tokens, every option with its description
  and probability, what Jev saw (when stored), the threshold rule, and the What-if.
- **Draft**: the template draft, the evidence it used, Copy. Nothing is ever sent.

Company-level only: links to personal profiles (`linkedin.com/in/`, `/people/`, `/person/`, `/profile/`, people-search
hosts, `profiles.`/`people.` subdomains unless the page is about a company) are hidden and counted; the leadership
signal shows "Leadership change reported" with its sources, never a name. Shareable saved examples keep cited
sources only, the consulted total, answers, durations and decision stubs (no prompts).

### Map behaviour

One Mapbox map per target city, each fit to its own city's pins at zoom 11–12, with a 13 px city label. Pins are 10 px
ink dots with a 2 px white ring; they take the outcome colour when decided (green call, blue email, amber check, grey
not now); hovering a row enlarges its pin and shows the name. Positions are a deterministic spread around the city
centre (city level) unless an office address was geocoded. A missing token or WebGL keeps the list only.

---

## 6. Bugs found and lessons

| Bug | Fix | Lesson |
| --- | --- | --- |
| Map pins jumped to the corner | Mapbox positions markers through its own class on the element; setting `className` removed it. Now only our classes are toggled. | Never overwrite a library-owned element's class list. |
| Pins offset from their point | The marker element was larger than the dot (label inside the box), so the centre anchor missed. The element is now exactly the dot; the label hangs outside. | Anchor = the element's box. |
| Camera tour cancelled / city off-centre | `setPadding` cancelled an in-flight `flyTo`; padding is now passed per camera call. | Camera state changes are animations too. |
| Headcount disagreed between views | Apollo's estimate replaces the discovery estimate everywhere; an Apollo `0` means unknown, not zero people. | One source of truth per fact, and "0" is not "none". |
| An old funding round showed as a buying signal | Recency rule: a round counts only within 12 months of the reference date; older rounds are shown as a neutral fact. | Every time-based signal needs an explicit window and a reference date. |
| Live runs silently mixed in sample companies | A source without a key now stops with a note; fixtures only with an explicit "Fixtures only". | Never blend fixture and live data in one result set. |
| A rejected Jev key failed every call | 401/403 marks the key rejected (hashed), the decider degrades to the labelled heuristic, and the run records what actually decided. | Degrade loudly, and record the degraded mode in the evidence trail. |
| A run never ended in the browser (5 research started, 4 done, no run_finished) | Live repro on 2026-11-11: Linkup answered HTTP 400 `SEARCH_QUERY_NO_RESULT` for one company, and another company's research took 44 s with no bytes on the stream; `run_finished` was only sent after a successful save. Now: per-call and per-step timeouts, `run_finished` from a `finally` block, a 5 s heartbeat, and Simple ends an interrupted stream in a plain "The search stopped before it finished" state. The lost-stream case itself was not reproduced after the fix. | Every stream needs a guaranteed terminal event and a keep-alive; every external call needs a deadline. |
| Sources leaked removed evidence into What-if | The decision sees sources by domain only. | Counterfactuals must control every channel of evidence. |

---

## 7. Status

- **Live, verified on a real stack (2026-11-10/11)**: Linkup discovery and research, Cala discovery, Jev decisions via
  OpenRouter, Apollo enrichment, Mapbox maps and geocoding, the What-if counterfactual, the Simple and Pro views.
- **Implemented with unit tests, not run live**: signals `new_product_or_market`, `leadership_change` and
  `regulatory_or_compliance_trigger` (only `b2b-software-smb` used `new_product_or_market` and `leadership_change`
  live, in one run of 6 companies); presets `recruiting-services`, `outdoor-advertising-media` and `custom`.
- **Fixture**: the keyword heuristic decider (not Jev), fictional companies and research.
- **Untested**: TypeSafe direct route in this version; more than 3 cities; runs above 12 companies; concurrency > 3.

## 8. Open questions for the design gate

1. Where does a "profile" live in Alodai: Business pillar (offer, buyer) or a Sales module setting? Who may edit it?
2. Signals as a shared library: should other modules (e.g. account health) reuse the same signal definitions?
3. Storage of evidence trails (today JSON files): retention, GDPR scope (company data only, but sources can quote
   people), and per-tenant isolation.
4. Provider ownership: Linkup/Cala/Apollo as Alodai integrations with per-tenant keys and budgets, or platform-level?
5. Review routing: does "Check yourself" become an Alodai task with an owner and a due date?
6. Drafts: stay templates, or a governed generative step with approval? Sending stays out of scope until decided.
7. Cost model per search (Jev is ~$0.00016 per company; Linkup and Cala prices per plan still to be measured).
8. Leadership signals: the research prompt forbids names, but sources may still contain them. Is a name filter needed
   before storage?
