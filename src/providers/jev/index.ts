// Jev (TypeSafe), reached through OpenRouter's System One-compatible endpoint by default.
// Docs: https://openrouter.ai/docs/guides/community/jev and .../alphadecisions/submit-a-decisions-request.md
// POST <JEV_BASE_URL> (default https://openrouter.ai/api/v1/systemone), Authorization: Bearer <key>
// body: { model, state, questions: { id: { type: "choice", instructions, criteria: { label: description } } } }
// answer: { type: "choice", choice, confidence, probabilities: { label: p } } | { type: "refusal" }
// top level: { id, model, provider, answers, usage: { input_tokens, output_tokens, cost } }
import { createHash } from "node:crypto";
import { HTTP_TIMEOUT_MS } from "../../core/timeout";
import { recordCost, spendCall } from "../budget";
import type { Answer, DecisionProvider, DecisionQuestion, DecisionTrace } from "../../core/types";

export const OPENROUTER_SYSTEMONE = "https://openrouter.ai/api/v1/systemone";
export const TYPESAFE_SYSTEMONE = "https://api.typesafe.ai/v1/systemone";

export interface JevConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** "openrouter" | "typesafe-direct": shown in traces so the route is visible. */
  route: "openrouter" | "typesafe-direct";
}

/**
 * Key resolution: JEV_API_KEY_OPENROUTER, else nothing (fixture). JEV_API_KEY (TypeSafe direct) is only
 * used when JEV_USE_TYPESAFE_DIRECT=1. Never logs or returns the key outside this config.
 */
export function resolveJevConfig(env: NodeJS.ProcessEnv = process.env): JevConfig | null {
  const direct = env.JEV_USE_TYPESAFE_DIRECT === "1";
  const apiKey = direct ? env.JEV_API_KEY || env.TYPESAFE_API_KEY || "" : env.JEV_API_KEY_OPENROUTER || "";
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.JEV_BASE_URL || (direct ? TYPESAFE_SYSTEMONE : OPENROUTER_SYSTEMONE),
    model: env.JEV_MODEL || (direct ? "jev-latest" : "typesafe/jev-1.14"),
    route: direct ? "typesafe-direct" : "openrouter",
  };
}

// Keys Jev rejected with 401/403 in this process (hashed, never stored in clear). A rejected key is
// not retried: buildDeps falls back to the fixture decider until the key changes.
const rejectedKeys = new Set<string>();
const keyId = (k: string) => createHash("sha256").update(k).digest("hex").slice(0, 16);
export const isJevKeyRejected = (apiKey: string): boolean => rejectedKeys.has(keyId(apiKey));

interface JevChoiceAnswer {
  /** "choice", or "refusal" (no choice, no probabilities). */
  type?: string;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

/** The Jev `questions` object for a set of choice questions (also shown in the UI trace). */
export function jevQuestions(questions: DecisionQuestion[]): Record<string, unknown> {
  return Object.fromEntries(
    questions.map((q) => [
      q.id,
      {
        type: "choice",
        instructions: q.instructions,
        criteria: Object.fromEntries(Object.entries(q.options).map(([k, v]) => [k, v.description])),
      },
    ]),
  );
}

export class JevLiveProvider implements DecisionProvider {
  readonly mode = "live" as const;
  private readonly apiKey: string;
  private readonly model: string;
  constructor(private readonly cfg: JevConfig) {
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
  }

  async decide(state: string, questions: DecisionQuestion[], onTrace?: (t: DecisionTrace) => void): Promise<Record<string, Answer>> {
    const body = { model: this.model, state, questions: jevQuestions(questions) };
    const t0 = Date.now();
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (isJevKeyRejected(this.apiKey)) throw new Error("Jev rejected the API key (401): not retried");
      spendCall("jev");
      const res = await fetch(this.cfg.baseUrl, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS.jev),
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          model?: string;
          provider?: string;
          answers?: Record<string, JevChoiceAnswer>;
          usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
        };
        if (typeof json.usage?.cost === "number") recordCost("jev", json.usage.cost);
        onTrace?.({
          mode: "live",
          engine: "jev",
          // Observed: the response names the served model (e.g. "jev-1.14.0").
          model: json.model ?? this.model,
          state,
          questions: body.questions,
          answers: json.answers ?? null,
          route: this.cfg.route,
          usage: json.usage,
          ms: Date.now() - t0,
          at: new Date().toISOString(),
        });
        const out: Record<string, Answer> = {};
        for (const q of questions) {
          const a = json.answers?.[q.id];
          // A refusal carries no choice: the question stays unanswered (gate 2 drops it, action -> review).
          if (!a?.choice || a.type === "refusal") continue;
          const probabilities = a.probabilities ?? {};
          out[q.id] = {
            questionId: q.id,
            question: q.instructions,
            choice: a.choice,
            probability: probabilities[a.choice] ?? a.confidence ?? 0,
            probabilities,
          };
        }
        return out;
      }
      lastErr = `Jev HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status === 401 || res.status === 403) rejectedKeys.add(keyId(this.apiKey));
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    throw new Error(lastErr);
  }
}

/**
 * Fixture decider: NOT Jev. A keyword heuristic using each option's `fixtureMatch` regex,
 * so the demo runs end-to-end without a key. Output is labelled fixture everywhere.
 */
export class JevFixtureProvider implements DecisionProvider {
  readonly mode = "fixture" as const;

  async decide(state: string, questions: DecisionQuestion[], onTrace?: (t: DecisionTrace) => void): Promise<Record<string, Answer>> {
    const lowCoverage = /evidence_coverage: low/.test(state);
    const out: Record<string, Answer> = {};
    for (const q of questions) {
      const text = q.evidenceField ? lineFor(state, q.evidenceField) : state;
      const labels = Object.keys(q.options);
      const matched = labels.filter((l) => {
        const re = q.options[l]?.fixtureMatch;
        return l !== "unknown" && re && new RegExp(re, "i").test(text);
      });
      let choice: string;
      let top: number;
      if (matched.length === 1) [choice, top] = [matched[0]!, 0.82];
      else if (matched.length > 1) [choice, top] = [matched[0]!, 0.55];
      else if (q.options.unknown) [choice, top] = ["unknown", 0.7];
      else [choice, top] = [labels[labels.length - 1]!, 0.4];
      if (lowCoverage && !q.evidenceField) top = Math.min(top, 0.45);
      const rest = labels.filter((l) => l !== choice);
      const probabilities: Record<string, number> = { [choice]: top };
      for (const l of rest) probabilities[l] = +((1 - top) / rest.length).toFixed(3);
      out[q.id] = { questionId: q.id, question: q.instructions, choice, probability: top, probabilities };
    }
    onTrace?.({
      mode: "fixture",
      engine: "fixture-heuristic",
      state,
      questions: jevQuestions(questions),
      answers: out,
      ms: 0,
      at: new Date().toISOString(),
    });
    return out;
  }
}

function lineFor(state: string, field: string): string {
  // Value only: the field name itself must never match an option regex.
  const line = state.split("\n").find((l) => l.startsWith(`${field}:`)) ?? "";
  return line.slice(field.length + 1).trim();
}

/**
 * Live Jev that degrades to the fixture heuristic if Jev rejects the key (401/403) before any live
 * answer was used. `mode` reflects what actually decided; each answer's trace says which engine ran.
 */
export class JevWithAuthFallback implements DecisionProvider {
  private readonly fixture = new JevFixtureProvider();
  private fellBack = false;
  constructor(private readonly live: JevLiveProvider, private readonly apiKey: string, private readonly onFallback?: (msg: string) => void) {}

  get mode(): "live" | "fixture" {
    return this.fellBack ? "fixture" : "live";
  }

  async decide(state: string, questions: DecisionQuestion[], onTrace?: (t: DecisionTrace) => void): Promise<Record<string, Answer>> {
    if (!this.fellBack) {
      try {
        return await this.live.decide(state, questions, onTrace);
      } catch (err) {
        if (!isJevKeyRejected(this.apiKey)) throw err;
        this.fellBack = true;
        this.onFallback?.("Jev rejected the API key (HTTP 401): this run's decisions use the fixture keyword heuristic, not Jev");
      }
    }
    return this.fixture.decide(state, questions, onTrace);
  }
}
