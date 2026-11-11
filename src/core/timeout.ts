// Time limits for every provider call. A call that does not answer in time fails for that company (or that
// discovery source) only; the run always continues and always ends. Pure.

/** Per pipeline step, in ms. Set from observed maxima (Linkup research 44 s, Cala discovery 55 s) with headroom. */
export interface StepTimeouts {
  discovery: number;
  research: number;
  decision: number;
  enrichment: number;
}

export const DEFAULT_TIMEOUTS: Readonly<StepTimeouts> = { discovery: 90_000, research: 60_000, decision: 30_000, enrichment: 20_000 };

/** Per provider HTTP call, in ms (the fetch is aborted). Slightly under the step limits above. */
export const HTTP_TIMEOUT_MS = { linkup: 55_000, cala: 85_000, jev: 20_000, apollo: 15_000, geocode: 10_000 } as const;

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not answer within ${Math.round(ms / 1000)} s`);
    this.name = "TimeoutError";
  }
}

/** Resolves or rejects like `p`, or rejects with a TimeoutError after `ms`. The timer is cleared as soon as `p` settles. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}
