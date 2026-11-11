# Demo script: 3 minutes, any B2B seller

**Before going on stage**

```bash
pnpm dev                 # http://localhost:3000 at 1440 px, zoom 100%, the page opens on Simple
```

- The header toggle shows **Simple**. The story starts in Simple and goes to Pro once.
- Safety net: in step 1, **Use a saved example** replays the saved example for the selected preset (Pro → Setup →
  "Replay a saved run" lists them with ★ and their column counts, e.g. `★ workspace · call 2 · email 3 · check 1 · not now 2`).
- Live budget: one live search is about 30 Jev calls, 12 Linkup calls and 2 Cala queries (see
  [docs/PORTING-TO-ALODAI.md](docs/PORTING-TO-ALODAI.md) for measured cost). Check `runs/call-ledger.json` before going on.
- Rehearse the What-if on a "Call this week" card that has a funding tick: removing only the funding evidence
  usually moves it from call to email. Jev is not fully deterministic, so expect small differences.
- Dossier deep links (open one company directly, from a saved example, no provider calls):
  `http://localhost:3000/?company=zazume&run=example-b2b-software-smb` · `?company=biorce` (workspace example).

---

## 0:00–0:20 · The problem (20 s)

**Show:** the hero, "Know who to sell to next."

**Say:** "Anyone who sells to companies loses most of their week on the wrong ones. Lists are easy to buy. Knowing
who will buy *now*, and why, is the hard part."

## 0:20–0:45 · Step 1: what you sell, and to whom (25 s)

**Point at:** the preset cards. Select **Flexible workspace**: the offer, the buyer, cities, team size, sectors and the
signal chips fill in.

**Click:** **B2B software for SMBs** once: everything changes (one city, different signals such as "New leadership").
Then back to **Flexible workspace**.

**Say:** "Start from the closest example and change anything: the offer, the buyer, the cities, the signs that someone
is ready to buy. Changes apply to this search only."

**Click:** **Find companies**.

## 0:45–1:20 · Step 2: who we found, live (35 s)

**Point at:** rows appearing on the left, each walking through "Checking fit… → Reading the news… → Deciding…", and
pins appearing on the city maps on the right (one map per city).

**Hover:** a row: its pin grows and shows the name.

**Say:** "Two real sources search the web and company data. Each company is checked against your profile,
researched with sources, then decided. As decisions land, the list sorts itself: the most urgent first."

When the button lights up, **click:** **See what to do**: the rows fly into four columns.

## 1:20–1:40 · Step 3: what to do (20 s)

**Point at:** the headline ("Call 2 companies this week.") and the columns: **Call this week · Send an email ·
Check yourself · Not now**.

**Say:** "Every card says what to do, how sure the AI is in plain words, and the evidence behind it. Nothing is ever
sent: drafts are for you to copy."

## 1:40–2:00 · The dossier: "click Zazume, here is why" (20 s)

**Click:** the **Zazume** card (B2B software preset; or open the deep link above). The dossier slides in.

**Point at:** the one sentence ("Call this week: raised Series A in Jun 2026 and is hiring in Barcelona"), the
decision path with real durations (Found → Fits your profile → Researched → Decided), and **What pushed it here**,
each fact with its source chips. **Press →** once to show the next company, **←** to come back.

**Say:** "Click any company and you see everything we found, and why the AI decided."

## 2:00–2:30 · How the AI decided (30 s)

**Click:** the **How the AI decided** tab. Point at the model and its cost per step ("jev-1.14 via OpenRouter ·
209 ms · $0.00008"), every option with its probability, and the threshold sentence. "Below this line, a human
checks it. That threshold is a policy you set, not a model."

**Scroll to:** **What if?** Tick the funding evidence, click **Ask Jev again** (2 live calls). "Take the funding
evidence away and ask again. We can only remove evidence, never invent it." The **Why** tab now shows the result
under "What would change it".

## 2:30–2:50 · Trust (20 s)

**Point at:** the dossier's **Sources** tab: the counts (e.g. "89 consulted · 7 cited"), sources grouped by domain, and the line
"personal-profile sources hidden".

**Say:** "Every tick links to its source. Company data only, never people: enrichment keeps an allowlist of company
fields and drops everything else. And every run is saved as one evidence trail: inputs, every question, every
answer, every source, the decision and the draft."

## 2:50–3:00 · Close (10 s)

**Say:** "This becomes a module of Alodai for any B2B team: change the profile, not the code."

---

## Fallback: network or a provider down

**Click:** in step 1, **Use a saved example**. It replays a real search recorded earlier for the selected preset, and
the banner says so. Continue from 0:45. The What-if needs Jev reachable; if it is not, skip that beat and show the
Jev bars only.

## Honesty rules on stage

- A saved example is always labelled as one. Never present it as live.
- Company-level data only. No people are fetched, stored or shown.
- Drafts are never sent.
