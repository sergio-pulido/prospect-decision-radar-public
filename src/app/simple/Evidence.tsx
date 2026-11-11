import type { Tick } from "../../core/plain";
import { Icon } from "./ui";

const domainOf = (url: string): string => url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0] ?? url;

/** Evidence rows: an SF-style glyph, the fact in plain words, and a quiet source chip. */
export function EvidenceRows({ ticks, size }: { ticks: Tick[]; size?: string }) {
  if (!ticks.length && !size) return null;
  return (
    <ul className="a-ev">
      {size && (
        <li className="k-size" title={size}>
          <Icon name="xmark" size={16} className="a-ev-glyph" />
          <span className="a-ev-text">{size.replace(/\s*\(.*$/, "")}</span>
          {/\((.*)\)/.test(size) && <span className="a-src quiet">{size.match(/\((.*)\)/)![1]}</span>}
        </li>
      )}
      {ticks.map((t) => (
        <li key={t.text} className={`k-${t.kind}`} title={t.text}>
          <Icon name={t.kind === "yes" ? "check" : t.kind === "unknown" ? "question" : t.kind === "fact" ? "dot" : "xmark"} size={16} className="a-ev-glyph" />
          <span className="a-ev-text">{t.text}</span>
          {t.source && (
            // The source's own icon when the provider returned one (Linkup `favicon`), else a globe glyph.
            <a className="a-src" href={t.source} target="_blank" rel="noreferrer" title={t.source}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {t.favicon ? <img className="a-fav" src={t.favicon} alt="" width={12} height={12} referrerPolicy="no-referrer" loading="lazy" /> : <Icon name="globe" size={12} />}
              <span className="a-src-t">{domainOf(t.source)}</span>
            </a>
          )}
          {!t.source && t.via && <span className="a-src quiet">{t.via}</span>}
        </li>
      ))}
    </ul>
  );
}
