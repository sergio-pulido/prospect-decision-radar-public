// Wires providers from env. A missing key means fixture mode for that provider.
import type { PipelineDeps } from "../core/pipeline";
import type { Company, Evidence, Profile, ResearchProvider, RunRecord } from "../core/types";
import { ApolloEnrichmentProvider, apolloBlocked, FixtureEnrichment } from "./apollo";
import { CalaDiscoveryProvider, FixtureDiscoveryProvider } from "./cala";
import { isJevKeyRejected, JevFixtureProvider, JevLiveProvider, JevWithAuthFallback, resolveJevConfig } from "./jev";
import { LinkupDiscoveryProvider, LinkupFixtureResearch, LinkupResearchProvider } from "./linkup";

/** Fictional fixture companies never go to a live provider: researching them would waste real calls. */
class FictionAwareResearch implements ResearchProvider {
  readonly mode = "live" as const;
  private readonly fixture = new LinkupFixtureResearch();
  constructor(private readonly live: ResearchProvider) {}
  research(c: Company, p: Profile): Promise<Evidence> {
    return c.discoveredBy === "fixture" ? this.fixture.research(c, p) : this.live.research(c, p);
  }
}

export function buildDeps(opts: { forceFixtures?: boolean; onNote?: (msg: string) => void } = {}): {
  deps: PipelineDeps;
  providers: RunRecord["providers"];
} {
  const force = opts.forceFixtures || process.env.FORCE_FIXTURES === "1";
  const jevCfg = force ? null : resolveJevConfig();
  const jev = jevCfg && !isJevKeyRejected(jevCfg.apiKey) ? jevCfg : null;
  const linkupKey = force ? "" : process.env.LINKUP_API_KEY || "";
  const calaKey = force ? "" : process.env.CALA_API_KEY || "";
  const depth = process.env.LINKUP_DEPTH || "standard";
  // Optional: no key (or a key Apollo rejected) means no enrichment, nothing else changes.
  const apolloKey = force || apolloBlocked() ? "" : process.env.APOLLO_API_KEY || "";

  const fixtureDiscovery = new FixtureDiscoveryProvider();
  const deps: PipelineDeps = {
    decision: jev ? new JevWithAuthFallback(new JevLiveProvider(jev), jev.apiKey, opts.onNote) : new JevFixtureProvider(),
    research: linkupKey ? new FictionAwareResearch(new LinkupResearchProvider(linkupKey, depth)) : new LinkupFixtureResearch(),
    discovery: {
      fixture: fixtureDiscovery,
      cala: calaKey ? new CalaDiscoveryProvider(calaKey) : fixtureDiscovery,
      linkup: linkupKey ? new LinkupDiscoveryProvider(linkupKey, depth) : fixtureDiscovery,
    },
    enrichment: apolloKey ? new ApolloEnrichmentProvider(apolloKey) : force ? new FixtureEnrichment() : undefined,
    concurrency: 3,
  };
  return {
    deps,
    providers: {
      jev: deps.decision.mode,
      linkup: deps.research.mode,
      cala: calaKey ? "live" : "fixture",
    },
  };
}

export function providerStatus() {
  return buildDeps().providers;
}

/** True when a Jev key is configured but Jev rejected it earlier in this process. */
export function jevKeyRejected(): boolean {
  const cfg = resolveJevConfig();
  return !!cfg && isJevKeyRejected(cfg.apiKey);
}
