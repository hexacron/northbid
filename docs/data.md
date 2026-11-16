# Data

Northbid loads open data published by Public Services and Procurement Canada through [CanadaBuys](https://canadabuys.canada.ca/en/procurement-and-contracting-data), under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).

## Source files

| File | URL | Publisher's schedule | Loaded into |
|---|---|---|---|
| Open tender notices | `canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv` | daily, 7:00–8:30 (UTC-05:00) | `tenders` |
| New tender notices | `canadabuys.canada.ca/opendata/pub/newTenderNotice-nouvelAvisAppelOffres.csv` | every 2 hours, 6:15–22:15 | `tenders` |
| Standing offers and supply arrangements | `sosa.canadabuys.canada.ca/cds/opendata/tpsgc-pwgsc_ocama-sosa.csv` | weekly | `standing_offers` |

The publisher's field descriptions are in the [CanadaBuys data dictionary](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/achatscanada-canadabuys-dd.xml) and the [supporting documentation](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/soutien-support-eng.html).

## Coverage limits

- **Federal only.** The CanadaBuys website also lists provincial and municipal tenders; the open data files do not.
- **Open tenders only.** Closed, cancelled and expired notices, award notices and contract history are not loaded yet.
- **Standing offers are PSPC-issued** agreements that are currently active.

## Normalization

The source files are wide, bilingual and loosely formatted. Northbid changes the shape, never the meaning:

- **Column names.** `tenderClosingDate-appelOffresDateCloture` becomes `closing_date`; bilingual pairs become `title_en` and `title_fr`.
- **Multi-value cells.** The source writes `*Goods` and `*Services` on separate lines of one cell. These are stored as newline-separated values and returned as arrays.
- **Free text.** HTML tags are removed and entities such as `&eacute;` are decoded in titles and descriptions.
- **Closing times.** The source gives a time with no offset and documents it as UTC-05:00 year-round. Northbid appends `-05:00`. Note this is not Eastern Daylight Time in summer.
- **Standing offers.** The source has one row per agreement per delivery point. Rows that differ only by delivery point are merged into one record with a list of delivery points (6,842 rows became 3,981 records in the October 2026 file).
- **Links.** `url` is built from the reference number in the form CanadaBuys uses for notice pages. The buyer's own link, when given, is returned as `bidding_url`.

## Tables

`tenders`, one row per notice, keyed by `reference_number`:

| Columns | Notes |
|---|---|
| `reference_number`, `amendment_number`, `solicitation_number` | The files carry only the latest amendment of each notice |
| `title_en/_fr`, `description_en/_fr` | |
| `publication_date`, `closing_date`, `amendment_date`, `expected_start_date`, `expected_end_date` | ISO dates; `closing_date` has a time and offset |
| `status_en/_fr` | Always `Open` in the loaded files |
| `categories` | Codes: `CNST`, `GD`, `SRV`, `SRVTGD` |
| `notice_type_en/_fr`, `procurement_method_en/_fr`, `selection_criteria_en/_fr`, `limited_tendering_reason_en/_fr` | |
| `trade_agreements_en/_fr`, `regions_of_opportunity_en/_fr`, `regions_of_delivery_en/_fr` | Multi-value |
| `unspsc_codes`, `unspsc_en/_fr`, `gsin_codes`, `gsin_en/_fr` | Multi-value. GSIN is the older classification and is mostly empty |
| `buyer_en/_fr`, `buyer_address_en/_fr`, `end_user_en/_fr` | Contracting entity and the organizations it buys for |
| `contact_name`, `contact_email`, `contact_phone` | |
| `notice_url_en/_fr`, `attachments_en/_fr` | |
| `source` | `open_tenders` or `new_tenders` |

`standing_offers`, one row per agreement and supplier:

| Columns | Notes |
|---|---|
| `agreement_number`, `agreement_type_en/_fr` | |
| `title_en/_fr` | |
| `commodity_codes`, `commodity_en/_fr` | UNSPSC; multi-value |
| `supplier_name`, `supplier_legal_name`, `supplier_operating_name` | `supplier_name` is the publisher's standardized form |
| `department_en/_fr` | |
| `award_date`, `expiry_date` | |
| `delivery_point_codes`, `delivery_points_en/_fr` | Multi-value |

Each table has a full-text index over its text columns that ignores case and accents. `files` records, per source file, the version marker, the publisher's last-modified time and when it was last fetched and checked.

## Known quirks

- **"Open" notices past their deadline.** The open file includes notices whose closing date has passed, some by years (58 of 946 on 2026-11-16). `search_tenders` hides them unless `include_past_deadline` is true.
- **Publication lag.** Notices created in SAP Ariba appear the day after publication. The new-notices file can hold notices the open file has not picked up yet, which is why both are loaded.
- **Missing fields.** About one notice in eight has no notice type or UNSPSC code, and a few have no publication date. Regions of delivery are free text and mix provinces, cities and `Canada`.
- **Reference numbers are not stable across systems.** To follow a procurement into other datasets, use the solicitation number, as the publisher recommends.
- **Agreement types can disagree with titles.** A standing offer titled "RMSO" may be typed `RISO` in the data. Northbid reports the typed value.
- **Incomplete certificate chain.** `sosa.canadabuys.canada.ca` does not send its intermediate certificate. See [architecture.md](architecture.md#downloading).
- **User agent filtering.** `canadabuys.canada.ca` returns 403 to Node's default user agent and to agents containing a URL. Northbid identifies itself as `northbid/<version>`.

## Attribution

Contains information licensed under the Open Government Licence – Canada.
