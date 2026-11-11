# Provider response shapes (observed)

Probed 2026-11-10T18:22:51.423Z with `pnpm probe`: one real call per provider. Values truncated to 80 chars. No keys.

## jev

Re-probed 2026-11-10T19:00:10.511Z with `pnpm probe -- --only jev`.

HTTP 200, 340 ms.

Request body:

```json
POST https://openrouter.ai/api/v1/systemone
{
  "model": "typesafe/jev-1.14",
  "state": "Company: Example Robotics SL. City: Barcelona. Employees: 45. Raised a 6M EUR Series A in March. Hiring 12 engineers in Barcelona.",
  "questions": {
    "next_step": {
      "type": "choice",
      "instructions": "What is the best next commercial step for a flexible-workspace provider?",
      "criteria": {
        "call_now": "Strong, recent signals of office need in the target city.",
        "send_email": "Some signals; a short email is appropriate.",
        "nurture": "No clear signal yet."
      }
    }
  }
}
```

Response shape:

```json
{
  "model": "string: \"typesafe/jev-1.14-20261014\"",
  "answers": {
    "next_step": {
      "type": "string: \"choice\"",
      "choice": "string: \"call_now\"",
      "probabilities": {
        "call_now": "number: \"0.95\"",
        "send_email": "number: \"0.04\"",
        "nurture": "number: \"0.01\""
      },
      "confidence": "number: \"0.92\""
    }
  },
  "usage": {
    "input_tokens": "number: \"390\"",
    "output_tokens": "number: \"44\"",
    "cost": "number: \"0.00001638\"",
    "is_byok": "boolean: \"false\"",
    "cost_details": {
      "upstream_inference_cost": "number: \"0.00001638\"",
      "upstream_inference_prompt_cost": "number: \"0.00001638\"",
      "upstream_inference_completions_cost": "number: \"0\""
    }
  },
  "id": "string: \"gen-dec-1794337210-F5debX70wXV2O4NF7LI8\"",
  "provider": "string: \"TypeSafe\""
}
```
## linkup

HTTP 200, 3633 ms.

Request body:

```json
{
  "q": "Research the company Factorial (factorialhr.com). Company-level facts only: funding in the last 12 months and offices in Barcelona.",
  "depth": "standard",
  "outputType": "structured",
  "structuredOutputSchema": "{\"type\":\"object\",\"properties\":{\"funding_last_12_months\":{\"type\":\"string\"},\"office_in_barcelona\":{\"type\":\"string\"}},\"required\":[\"funding_last_12_months\",\"office_in_barcelona\"]}",
  "includeSources": true
}
```

Response shape:

```json
{
  "data": {
    "funding_last_12_months": "string: \"In June 2026, Factorial announced a $150 million Series D led by General Catalys…\"",
    "office_in_barcelona": "string: \"Yes. Factorial’s Barcelona office and headquarters are at Carrer de Llacuna, 56,…\""
  },
  "sources": [
    "array (40 items), first item:",
    {
      "name": "string: \"Factorial · Embedded Finance Index 2026 · Embedded Finance Intelligence\"",
      "url": "string: \"https://www.embeddedfinanceindex.com/companies/factorial\"",
      "content": "string: \"Last 12 months · 2026-06 · Announced $150M Series D at $2.5B valuation led by Ge…\"",
      "favicon": "string: \"https://favicons.linkup.so?domain=www.embeddedfinanceindex.com\"",
      "type": "string: \"text\""
    }
  ]
}
```

## cala

HTTP 200, 50805 ms.

Request body:

```json
{
  "input": "Companies headquartered or with an office in Barcelona, between 10 and 200 employees, in sectors software, saas, fintech, insurtech, legaltech, health tech, digital agency, consulting, gaming, life sciences, e-commerce, that raised funding in the last 12 months. Return name, website, city, employees, sector.",
  "return_entities": true
}
```

Response shape:

```json
{
  "results": [
    "array (20 items), first item:",
    {
      "name": "string: \"Biorce\"",
      "website": "string: \"biorce.com\"",
      "city": "string: \"Barcelona\"",
      "employees": "string: \"~150–200\"",
      "sector": "string: \"Health Tech / AI Clinical Trials\""
    }
  ],
  "entities": [
    "array (19 items), first item:",
    {
      "id": "string: \"853573cb-50dd-4950-9271-d084ced6b80a\"",
      "name": "string: \"Biorce\"",
      "entity_type": "string: \"Organization\"",
      "mentions": [
        "array (1 items), first item:",
        "string: \"Biorce\""
      ]
    }
  ]
}
```

## Comparison with the adapters (Phase 0)

- **Jev**: now routed through OpenRouter (`POST https://openrouter.ai/api/v1/systemone`, `Authorization: Bearer`,
  model `typesafe/jev-1.14`). The TypeSafe request body is accepted as is. Observed choice answer:
  `{ type, choice, probabilities, confidence }` with `probabilities` keyed by exactly the option labels sent in
  `criteria`, so the parser needed no change. OpenRouter adds top-level `id`, `provider` and
  `usage.{cost, is_byok, cost_details}`; `usage.cost` is added to the call ledger. Per the Decisions API reference, an
  answer can be `{ "type": "refusal" }` with no choice: the adapter treats it as unanswered. Earlier history:
  TypeSafe direct returned 401 for the first key and 200 after the key was replaced; that route now runs only with
  `JEV_USE_TYPESAFE_DIRECT=1`.
- **Linkup**: matches the adapter. `data` holds the structured object; `sources[]` has
  `name, url, content, favicon, type`. The adapter keeps `name` and `url` and drops `type: "image"`.
- **Cala**: `results[]` rows have `name, website, city, employees, sector`, which the `pick(...)` keys
  already cover. Fixed: `employees` is a string range (`"~150–200"`, lower bound kept), and entity
  fallback must filter `entity_type === "Organization"` (was `"Company"`). Latency was ~50 s for one call,
  and one call returned 20 rows: discovery slices them to the per-city limit.

## apollo

Re-probed 2026-11-10T19:37:51.720Z with `pnpm probe -- --only apollo`.

HTTP 200, 1258 ms.

Request body:

```json
GET https://api.apollo.io/api/v1/organizations/enrich?domain=biorce.com
(header x-api-key)
```

Response shape:

```json
{
  "organization": {
    "id": "string (not kept)",
    "name": "string: \"Biorce\"",
    "website_url": "string (not kept)",
    "angellist_url": "null (not kept)",
    "linkedin_url": "string (not kept)",
    "twitter_url": "null (not kept)",
    "facebook_url": "null (not kept)",
    "languages": "array (0) (not kept)",
    "alexa_ranking": "null (not kept)",
    "phone": "null (not kept)",
    "linkedin_uid": "string (not kept)",
    "founded_year": "number (not kept)",
    "publicly_traded_symbol": "null (not kept)",
    "publicly_traded_exchange": "null (not kept)",
    "logo_url": "string (not kept)",
    "crunchbase_url": "null (not kept)",
    "primary_domain": "string: \"biorce.com\"",
    "sic_codes": "array (1) (not kept)",
    "naics_codes": "array (1) (not kept)",
    "industry": "string: \"research\"",
    "estimated_num_employees": "number: \"180\"",
    "keywords": "array (13) (not kept)",
    "organization_revenue_printed": "string (not kept)",
    "organization_revenue": "number (not kept)",
    "industries": "array (3) (not kept)",
    "secondary_industries": "array (2) (not kept)",
    "snippets_loaded": "boolean (not kept)",
    "industry_tag_id": "string (not kept)",
    "industry_tag_hash": "object (not kept)",
    "retail_location_count": "number (not kept)",
    "raw_address": "string: \"barcelona, catalonia, 08002, spain\"",
    "street_address": "null",
    "city": "string: \"Barcelona\"",
    "state": "string (not kept)",
    "postal_code": "string: \"08002\"",
    "country": "string: \"Spain\"",
    "owned_by_organization_id": "null (not kept)",
    "num_languages": "number (not kept)",
    "num_retail_locations": "number (not kept)",
    "short_description": "string (not kept)",
    "total_funding": "number (not kept)",
    "total_funding_printed": "string: \"61.4M\"",
    "latest_funding_round_date": "string: \"2026-02-01T00:00:00.000+00:00\"",
    "latest_funding_stage": "string: \"Series A\"",
    "latest_funding_detected_at": "string (not kept)",
    "funding_events": [
      "array (3 items), first item (only date, type, amount, currency are kept):",
      {
        "id": "string (not kept)",
        "date": "string: \"2026-02-01T00:00:00.000+00:00\"",
        "news_url": "string (not kept)",
        "detected_at": "string (not kept)",
        "type": "string: \"Series A\"",
        "investors": "string (not kept: can name individual people)",
        "amount": "string: \"52M\"",
        "currency": "string: \"$\""
      }
    ],
    "suborganizations": "array (0) (not kept)",
    "num_suborganizations": "number (not kept)",
    "annual_revenue_printed": "string (not kept)",
    "annual_revenue": "number (not kept)",
    "technology_names": "array (185) (not kept)",
    "current_technologies": "array (185) (not kept)",
    "org_chart_root_people_ids": "array (1) (not kept)",
    "org_chart_sector": "string (not kept)",
    "org_chart_removed": "null (not kept)",
    "org_chart_show_department_filter": "null (not kept)",
    "is_placeholder_organization": "null (not kept)",
    "departmental_head_count": "object (not kept)",
    "organization_headcount_six_month_growth": "number: \"1.296296296296296\"",
    "organization_headcount_twelve_month_growth": "number: \"9.333333333333334\"",
    "organization_headcount_twenty_four_month_growth": "number: \"19.66666666666667\""
  }
}
```

### Apollo notes (Phase: enrichment)

- Only `GET /api/v1/organizations/enrich?domain=` is called, header `x-api-key`. No people or contact endpoint.
- Kept fields (allowlist in `src/providers/apollo/allowlist.ts`): name, primary_domain, estimated_num_employees, industry,
  city, street_address, postal_code, country, raw_address, total_funding_printed, latest_funding_round_date,
  latest_funding_stage, funding_events[date, type, amount, currency], and the three growth fields
  `organization_headcount_six_month_growth`, `organization_headcount_twelve_month_growth`,
  `organization_headcount_twenty_four_month_growth`. Everything else is dropped before storage.
- Growth unit: a number, observed 9.33 for 12 months at 180 employees. It reads as a fraction (9.33 = +933%), which is
  consistent with Linkup research reporting ~12 to ~120 employees in a year for the same company. Not stated by the docs
  we read; shown as "+N%" with that assumption.
- `street_address` was null for this company; `raw_address` was city + postcode only.

## geocode

Re-probed 2026-11-10T19:39:00.229Z with `pnpm probe -- --only geocode`.

HTTP 200, 227 ms.

Request body:

```json
GET https://api.mapbox.com/search/geocode/v6/forward?q=Avinguda Diagonal 615, 08028 Barcelona, Spain&limit=1&access_token=<public pk token>
```

Response shape:

```json
{
  "type": "string: \"FeatureCollection\"",
  "features": [
    "array (1 items), first item:",
    {
      "type": "string: \"Feature\"",
      "id": "string: \"dXJuOm1ieGFkcjpjNWNmMmRiNi05NzM4LTRiYWUtOWRmYi0zNDllZTFjYTRmOTc\"",
      "geometry": {
        "type": "string: \"Point\"",
        "coordinates": [
          "array (2 items), first item:",
          "number: \"2.128764\""
        ]
      },
      "properties": {
        "mapbox_id": "string: \"dXJuOm1ieGFkcjpjNWNmMmRiNi05NzM4LTRiYWUtOWRmYi0zNDllZTFjYTRmOTc\"",
        "feature_type": "string: \"address\"",
        "full_address": "string: \"Avinguda Diagonal 615, 08028 Barcelona, Barcelona, Spain\"",
        "name": "string: \"Avinguda Diagonal 615\"",
        "name_preferred": "string: \"Avinguda Diagonal 615\"",
        "coordinates": {
          "longitude": "number: \"2.128764\"",
          "latitude": "number: \"41.388239\"",
          "accuracy": "string: \"rooftop\"",
          "routable_points": [
            "array (1 items), first item:",
            "object (deeper levels omitted)"
          ]
        },
        "place_formatted": "string: \"08028 Barcelona, Barcelona, Spain\"",
        "match_code": {
          "address_number": "string: \"matched\"",
          "street": "string: \"matched\"",
          "postcode": "string: \"matched\"",
          "place": "string: \"matched\"",
          "region": "string: \"unmatched\"",
          "locality": "string: \"not_applicable\"",
          "country": "string: \"matched\"",
          "confidence": "string: \"high\""
        },
        "context": {
          "address": {
            "mapbox_id": "string: \"dXJuOm1ieGFkcjpjNWNmMmRiNi05NzM4LTRiYWUtOWRmYi0zNDllZTFjYTRmOTc\"",
            "address_number": "string: \"615\"",
            "street_name": "string: \"Avinguda Diagonal\"",
            "name": "string: \"Avinguda Diagonal 615\""
          },
          "street": {
            "mapbox_id": "string: \"dXJuOm1ieGFkci1zdHI6YzVjZjJkYjYtOTczOC00YmFlLTlkZmItMzQ5ZWUxY2E0Zjk3\"",
            "name": "string: \"Avinguda Diagonal\""
          },
          "postcode": {
            "mapbox_id": "string: \"dXJuOm1ieHBsYzpqTTVH\"",
            "name": "string: \"08028\""
          },
          "locality": {
            "mapbox_id": "string: \"dXJuOm1ieHBsYzpERmJLUmc\"",
            "name": "string: \"Les Corts\"",
            "wikidata_id": "string: \"Q959944\""
          },
          "place": {
            "mapbox_id": "string: \"dXJuOm1ieHBsYzpkZWhH\"",
            "name": "string: \"Barcelona\"",
            "wikidata_id": "string: \"Q1492\""
          },
          "region": {
            "mapbox_id": "string: \"dXJuOm1ieHBsYzpCSVJH\"",
            "name": "string: \"Barcelona\"",
            "wikidata_id": "string: \"Q81949\"",
            "region_code": "string: \"B\"",
            "region_code_full": "string: \"ES-B\"",
            "alternate": "object (deeper levels omitted)"
          },
          "country": {
            "mapbox_id": "string: \"dXJuOm1ieHBsYzpJa1k\"",
            "name": "string: \"Spain\"",
            "wikidata_id": "string: \"Q29\"",
            "country_code": "string: \"ES\"",
            "country_code_alpha_3": "string: \"ESP\""
          }
        }
      }
    }
  ],
  "attribution": "string: \"NOTICE: © 2026 Mapbox and its suppliers. All rights reserved. Use of this data i…\""
}
```
