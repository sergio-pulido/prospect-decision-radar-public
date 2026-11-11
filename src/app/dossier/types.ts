// Dossier view types (client).
export type TabId = "why" | "evidence" | "company" | "sources" | "decided" | "draft";

export const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "why", label: "Why" },
  { id: "evidence", label: "Evidence" },
  { id: "company", label: "Company data" },
  { id: "sources", label: "Sources" },
  { id: "decided", label: "How the AI decided" },
  { id: "draft", label: "Draft" },
];

/** A What-if run for one company, kept while the page is open. */
export interface WhatIfResult {
  removedLabels: string[];
  beforeLabel: string;
  beforePct: number;
  afterLabel: string;
  afterPct: number;
  mode: "live" | "fixture";
}
