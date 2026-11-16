# Tool reference

All tools return JSON as text. Empty fields are omitted. Search results carry `source_updated` (when CanadaBuys published the file) and, if a refresh failed, a `warnings` array. Every tool except `refresh_data` is read-only.

## Query syntax

`query`, `buyer`, `supplier` and `department` take plain words.

| You write | It matches |
|---|---|
| `bridge repair` | notices containing both words |
| `"bridge repair"` | that exact phrase |
| `engineer*` | engineer, engineers, engineering |
| `translation OR traduction` | either word |
| `reparations` | réparations, Réparations, REPARATIONS |

English and French text are searched together. Any other punctuation is treated as text, so no input causes a syntax error. Set `match: "any"` to require only one of the words.

## search_tenders

Search currently open federal tender notices. With no arguments it lists the tenders closing soonest.

| Parameter | Type | Notes |
|---|---|---|
| `query` | string | Searches titles, descriptions, commodity names, buyer names and solicitation numbers |
| `match` | `all` \| `any` | Default `all` |
| `category` | array | Any of `construction`, `goods`, `services`, `services_related_to_goods` |
| `buyer` | string | Words from the contracting or end-user organization, either language |
| `region` | string | Text contained in a region of delivery. Nationwide tenders are listed as `Canada` |
| `unspsc` | string | 2 to 8 digits. `43000000` and `43` both match every code in segment 43 |
| `notice_type` | string | Text contained in the notice type, e.g. `Request for Proposal` |
| `closing_after`, `closing_before`, `published_after` | `YYYY-MM-DD` | |
| `include_past_deadline` | boolean | Default `false`; see [data.md](data.md#known-quirks) |
| `sort` | `relevance` \| `closing_soonest` \| `newest` | Default `relevance` with a query, otherwise `closing_soonest` |
| `lang` | `en` \| `fr` | Default `en` |
| `limit`, `offset` | integer | `limit` 1–50, default 10 |

Example: `{"query": "reparations OR repairs", "limit": 1}`

```json
{
  "total": 19,
  "offset": 0,
  "returned": 1,
  "next_offset": 1,
  "results": [
    {
      "reference_number": "MX-243100787103",
      "solicitation_number": "202611001",
      "title": "Park Prestige - Structural & System Repairs",
      "buyer": "VIA Rail Canada Inc.",
      "categories": ["services"],
      "published": "2026-11-05",
      "closes": "2026-12-15T14:00:00-05:00",
      "excerpt": "The HEP Legacy fleet has exceeded its expected performance and investments are required on critical systems…",
      "url": "https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/mx-243100787103"
    }
  ],
  "source_updated": "2026-11-16T11:20:15Z"
}
```

## get_tender

Full record for one notice.

| Parameter | Type | Notes |
|---|---|---|
| `id` | string, required | Reference number or solicitation number. A solicitation number shared by several notices returns all of them |
| `lang` | `en` \| `fr` \| `both` | `both` suffixes every text field with `_en` or `_fr` |
| `max_description_chars` | integer | Default 6000. When the description is cut, `description_truncated` is `true` |

Example: `{"id": "IAAC-SBIPS-GIS-2026", "max_description_chars": 300}`

```json
{
  "tenders": [
    {
      "reference_number": "cb-621-34120934",
      "solicitation_number": "IAAC-SBIPS-GIS-2026",
      "amendment_number": "000",
      "status": "Open",
      "categories": ["services"],
      "published": "2026-11-13",
      "closes": "2026-11-30T14:00:00-05:00",
      "expected_contract_start": "2027-02-01",
      "expected_contract_end": "2029-12-31",
      "unspsc_codes": ["43232407", "80151605", "81111507", "81111508", "81111705"],
      "contact": { "name": "…", "email": "…", "phone": "…" },
      "title": "Geospatial Informatics Professional Services for the Impact Assessment Agency of Canada",
      "buyer": "Impact Assessment Agency of Canada (IAAC)",
      "buyer_address": "140 Elgin St, Ottawa, ON K2P 2H8, Canada",
      "notice_type": "Request for Proposal",
      "procurement_method": "Competitive - Selective tendering",
      "selection_criteria": "Highest Combined Rating of Technical Merit and Price",
      "trade_agreements": ["Please refer to Tender Description or Tender Documents"],
      "regions_of_opportunity": ["National Capital Region (NCR)"],
      "regions_of_delivery": ["Canada", "Remote Offsite"],
      "unspsc": ["Requirements analysis and system architecture software", "…"],
      "description": "The Impact Assessment Agency of Canada (IAAC) requires Stream 4 - Geospatial Informatics Services…",
      "description_truncated": true,
      "url": "https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/cb-621-34120934",
      "attachments": ["https://canadabuys.canada.ca/sites/default/files/webform/tender_notice/113333/npp-iaac-sbips-2026.pdf"]
    }
  ],
  "source_updated": "2026-11-16T11:20:15Z"
}
```

`url` is the CanadaBuys page for the notice. `bidding_url`, when present, is the external system named by the buyer (for example SAP Ariba or MERX).

## search_standing_offers

Search active standing offers and supply arrangements. One result is one agreement held by one supplier.

| Parameter | Type | Notes |
|---|---|---|
| `query` | string | Searches agreement titles, commodity names, supplier names, departments and agreement numbers |
| `match` | `all` \| `any` | Default `all` |
| `supplier` | string | Words from the legal, operating or standardized supplier name |
| `department` | string | Words from the department served, either language |
| `commodity` | string | UNSPSC code or prefix, 2 to 8 digits |
| `agreement_type` | string | `SA`, `NMSO`, `RMSO`, `NISO`, `RISO` or `DISO` |
| `region` | string | Text contained in a delivery point |
| `include_expired` | boolean | Default `false` |
| `lang`, `limit`, `offset` | | As above |

Results are ranked by relevance when `query` is given, otherwise by latest expiry.

Example: `{"supplier": "fca canada", "commodity": "25", "lang": "fr"}`

```json
{
  "total": 1,
  "offset": 0,
  "returned": 1,
  "results": [
    {
      "agreement_number": "CW2417541",
      "agreement_type": "OCPN",
      "title": "Véhicules légers - FCA",
      "supplier": "FCA CANADA INC",
      "supplier_legal_name": "FCA Canada Inc.",
      "department": "Travaux publics et Services gouvernementaux Canada",
      "commodities": ["25100000 - Véhicules à moteur"],
      "awarded": "2025-09-01",
      "expires": "2026-11-30",
      "delivery_points": ["Canada", "Alberta", "Colombie-Britannique", "Manitoba", "Région de la capitale nationale", "Nouveau-Brunswick", "+9 more"]
    }
  ],
  "source_updated": "2026-10-30T00:58:04Z"
}
```

Agreement types: `SA` supply arrangement; `NMSO` and `RMSO` national and regional master standing offers; `NISO`, `RISO` and `DISO` national, regional and departmental individual standing offers. French output uses the French abbreviations.

## data_status

No parameters. Lists each source file with `loaded`, `rows_in_file`, `source_updated`, `fetched_at` and `checked_at`, plus row counts per table and the database path. Does not use the network.

## refresh_data

No parameters. Checks every source file now and downloads those that changed, then returns the same report as `data_status`. Searches refresh automatically, so this is only needed on request.

| File | Automatic re-check |
|---|---|
| New tender notices | every 2 hours |
| Open tender notices | every 6 hours |
| Standing offers and supply arrangements | every 24 hours |

## Prompt: find_opportunities

For clients that surface MCP prompts. Arguments: `business` (required), `region`, `language`. It expands into the same workflow as the `find-opportunities` skill.

## Errors

A tool call that cannot be completed returns `isError: true` with a message saying what to change, for example:

- `Unknown argument "colour". Allowed: query, match, …`
- `"closing_before" has the wrong format. Only tenders closing on or before this date (YYYY-MM-DD).`
- `No open tender has reference or solicitation number "…". It may have closed or been cancelled; only open notices are loaded.`
- `Could not download Open tender notices from …: HTTP 503. Check the network connection and call refresh_data to retry.`
