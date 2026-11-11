export const pct = (p?: number): string => (typeof p === "number" ? `${Math.round(p * 100)}%` : "–");
