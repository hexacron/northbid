---
name: find-opportunities
description: Find open Government of Canada tenders that fit a business, using the northbid tools. Use when someone asks what federal contracts, tenders, RFPs or bidding opportunities they could pursue in Canada, or asks in French about appels d'offres or occasions de marché du gouvernement fédéral.
---

# Find federal bidding opportunities

Work through these steps with the `northbid` tools. Reply in the user's language and pass `lang: "fr"` when that language is French.

## 1. Understand the business

You need three things. Ask only for what the user has not already said.

- What they sell: goods, services, construction, or a mix.
- Where they can deliver: a province, the National Capital Region, or all of Canada.
- Anything that rules a tender out: security clearances they lack, minimum lead time before closing.

## 2. Search broadly

Buyers describe the same need in many ways, so one search is not enough.

- List the English and French terms a buyer might use and join them with `OR`, for example `translation OR traduction OR interpretation OR "language services"`.
- Run `search_tenders` once per distinct line of business.
- If the user gave a region, search that region and then `region: "Canada"`, because nationwide tenders are listed separately.
- Use `category` to cut noise, and `unspsc` when the user knows their commodity codes.
- If a search returns nothing, try `match: "any"` or a prefix such as `engineer*` before telling the user there is nothing.

## 3. Read the promising ones

Call `get_tender` for each candidate that looks like a fit. Check:

- the notice type: a Request for Information is not a bidding opportunity, and an Advance Contract Award Notice names an intended supplier that others may challenge;
- the procurement method: "Selective tendering" and "RFP against Supply Arrangement" are usually limited to suppliers who already hold the related supply arrangement, so confirm eligibility in the documents;
- selection criteria, trade agreements, and how much time is left before closing.

## 4. Show who is already in the market

Run `search_standing_offers` with the same terms. Tell the user which suppliers hold related agreements and when those agreements expire, since an expiring agreement is often re-competed.

## 5. Report

Give a shortlist as a table: title, buyer, closing date and time, why it fits, and the link. Then add:

- closing times are UTC-05:00 all year;
- the data date from `source_updated`, and that new notices can take up to a day to appear;
- the linked CanadaBuys page and its documents are authoritative, and the user must confirm details there before bidding.

Northbid covers open federal tenders and active standing offers only. If the user asks about provincial or municipal tenders, past awards or contract history, say that it is not covered.
