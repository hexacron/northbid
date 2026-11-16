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

## search_awards

Search award notices published on CanadaBuys since August 2022. One result is one notice at its latest amendment: a contract, standing offer or supply arrangement and the supplier that won it. With no arguments it lists the most recent awards. The first call downloads about 110 MB; see [data.md](data.md#source-files).

| Parameter | Type | Notes |
|---|---|---|
| `query` | string | Searches titles, descriptions, commodity names, supplier and buyer names, solicitation and contract numbers |
| `match` | `all` \| `any` | Default `all` |
| `supplier` | string | Words from the supplier's legal name |
| `buyer` | string | Words from the contracting or end-user organization, either language |
| `category` | array | Any of `construction`, `goods`, `services`, `services_related_to_goods` |
| `unspsc` | string | UNSPSC code or prefix, 2 to 8 digits |
| `region` | string | Text contained in a region of delivery |
| `competitive` | boolean | `true`: competitive methods only. `false`: non-competitive awards and advance contract award notices only. Awards with no stated method match neither |
| `awarded_after`, `awarded_before` | `YYYY-MM-DD` | By contract award date |
| `min_value`, `max_value` | integer | In the contract's currency. Awards with no stated value never match `max_value`, or a `min_value` above zero |
| `include_cancelled` | boolean | Default `false` |
| `sort` | `relevance` \| `newest` \| `highest_value` | Default `relevance` with a query, otherwise `newest` |
| `lang`, `limit`, `offset` | | As above |

Example: `{"query": "snow removal OR deneigement", "min_value": 100000, "limit": 1}`

```json
{
  "total": 108,
  "offset": 0,
  "returned": 1,
  "next_offset": 1,
  "results": [
    {
      "reference_number": "CW2331814",
      "solicitation_number": "WS4110213535",
      "title": "Contract WorkspaceEE517-240258 - Snow removal Services - Sidewalks, entrances exits and fire escapes",
      "supplier": "9255-1241 Québec inc, Déneigement Jocelyn Ouellet",
      "supplier_location": "Mont-Joli, Québec, CA",
      "buyer": "Department of Public Works and Government Services (PSPC)",
      "end_users": ["Department of Public Works and Government Services (PSPC)"],
      "value": 262717.88,
      "currency": "CAD",
      "awarded": "2023-09-21",
      "contract_end": "2027-09-30",
      "instrument_type": "Contract",
      "procurement_method": "Competitive - Open bidding",
      "categories": ["services"],
      "url": "https://canadabuys.canada.ca/en/tender-opportunities/award-notice/cw2331814"
    }
  ],
  "source_updated": "2026-11-16T10:30:11Z"
}
```

`value` is the total contract value, or the contract amount when the buyer gave no total; both fields are left out when neither was given, as for standing offers and supply arrangements. `status` appears only when the notice is not active (`Expired`, `Cancelled`).

## get_award

Full record for an award notice.

| Parameter | Type | Notes |
|---|---|---|
| `id` | string, required | Reference, solicitation or contract number. A solicitation with several awards returns the 20 most recent, and `total` gives the full count |
| `lang` | `en` \| `fr` | Default `en` |
| `max_description_chars` | integer | Default 6000. When the description is cut, `description_truncated` is `true` |

Adds to the summary: `contract_number`, `amendment_number`, `amendment_type`, `published`, `amended`, `contract_start`, `notice_type`, `selection_criteria`, `limited_tendering_reason`, `trade_agreements`, `regions_of_delivery`, `unspsc_codes`, `unspsc`, `description` and `contact`.

## summarize_awards

Counts award notices and totals their value per supplier, buyer or award year. It takes every filter of `search_awards`, plus:

| Parameter | Type | Notes |
|---|---|---|
| `group_by` | `supplier` \| `buyer` \| `year`, required | `buyer` is the contracting organization. `year` is the calendar year of the award date, listed newest first |
| `sort` | `total_value` \| `awards` | Default `total_value` |

Example: `{"group_by": "supplier", "query": "translation OR traduction", "awarded_after": "2025-04-01", "limit": 2}`

```json
{
  "awards": 171,
  "total_value_cad": 44858765,
  "awards_without_value": 89,
  "awards_in_other_currencies": 0,
  "total": 114,
  "offset": 0,
  "returned": 2,
  "next_offset": 2,
  "results": [
    {
      "supplier": "R&R International Translation Specialists Inc.",
      "awards": 5,
      "total_value_cad": 8146105,
      "largest_value_cad": 7342315,
      "first_award": "2025-04-16",
      "latest_award": "2026-07-21"
    },
    {
      "supplier": "SYM COMMUNICATIONS INC./COMMUNICATIONS SYM INC.",
      "awards": 8,
      "total_value_cad": 4560685,
      "largest_value_cad": 1437188,
      "first_award": "2026-05-08",
      "latest_award": "2026-11-09"
    }
  ],
  "source_updated": "2026-11-16T10:30:11Z"
}
```

The top-level `awards` and `total_value_cad` cover everything the filters matched; `total` is the number of groups. Treat the totals as indicative:

- Only Canadian-dollar values are added. `awards_in_other_currencies` counts the valued awards left out.
- `awards_without_value` counts awards with no value, mostly standing offers and supply arrangements.
- Supplier names are grouped ignoring case, periods and commas. Other variants of one company's name are separate rows.
- Each value is the contract's latest published total, including amendments.

## data_status

No parameters. Lists each source file with `loaded`, `rows_in_file`, `source_updated`, `fetched_at` and `checked_at`, plus row counts per table and the database path. Does not use the network.

## refresh_data

No parameters. Checks every source file now and downloads those that changed, then returns the same report as `data_status`. Searches refresh automatically, so this is only needed on request.

| File | Automatic re-check |
|---|---|
| New tender notices | every 2 hours |
| Open tender notices | every 6 hours |
| Award notices, current fiscal year | every 6 hours |
| Award notices, earlier fiscal years | every 24 hours |
| Standing offers and supply arrangements | every 24 hours |

A file is only downloaded again when the source reports that it changed. If no award search has been run yet, `refresh_data` downloads the award files too.

## Prompt: find_opportunities

For clients that surface MCP prompts. Arguments: `business` (required), `region`, `language`. It expands into the same workflow as the `find-opportunities` skill.

## Errors

A tool call that cannot be completed returns `isError: true` with a message saying what to change, for example:

- `Unknown argument "colour". Allowed: query, match, …`
- `"closing_before" has the wrong format. Only tenders closing on or before this date (YYYY-MM-DD).`
- `No open tender has reference or solicitation number "…". It may have closed or been cancelled; only open notices are loaded.`
- `Could not download Open tender notices from …: HTTP 503. Check the network connection and call refresh_data to retry.`
