// Tool definitions. Descriptions carry the domain knowledge a model needs,
// so the server is usable without any client-specific skill or prompt file.

import { getTenders, InputError, searchStandingOffers, searchTenders } from './search.js';
import { lines } from './text.js';

export const INSTRUCTIONS = `Northbid searches Government of Canada procurement data published by CanadaBuys. It is an unofficial tool; data is cached locally and refreshed from the source automatically.

Coverage: currently open federal tender notices, and active standing offers and supply arrangements. Provincial and municipal tenders, awards and contract history are not included.

Using it well:
- Notices are bilingual. Search matches English and French text at once and ignores accents; pass lang "fr" to get French output.
- Keyword search needs every word unless you use OR. Procurement titles vary, so combine synonyms and both languages, e.g. "translation OR traduction OR interpretation".
- Start with search_tenders, then call get_tender for the notices worth reading in full.
- Closing times are UTC-05:00 all year, not local time.
- New notices can take up to a day to appear. Each result carries source_updated; tell the user the data date and that the linked CanadaBuys page is authoritative before they bid.`;

const CATEGORY = { construction: 'CNST', goods: 'GD', services: 'SRV', services_related_to_goods: 'SRVTGD' };
const CATEGORY_LABEL = Object.fromEntries(Object.entries(CATEGORY).map(([label, code]) => [code, label]));
const OTHER = { en: 'fr', fr: 'en' };

const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const LANG = { type: 'string', enum: ['en', 'fr'], default: 'en', description: 'Output language.' };
const LIMIT = { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Results per page (1-50).' };
const OFFSET = { type: 'integer', minimum: 0, maximum: 100000, default: 0, description: 'Results to skip, for paging.' };
const MATCH = {
  type: 'string', enum: ['all', 'any'], default: 'all',
  description: 'Whether a notice must contain all query terms or any of them. An explicit OR in the query always applies.',
};
const QUERY_SYNTAX =
  'Words match in English and French, ignoring case and accents. Use "double quotes" for an exact phrase, ' +
  'a trailing * for a prefix (engineer*), and uppercase OR between alternatives.';

const loc = (row, col, lang) => row[`${col}_${lang}`] || row[`${col}_${OTHER[lang]}`];

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out;
}

function capped(values, max) {
  return values.length > max ? [...values.slice(0, max), `+${values.length - max} more`] : values;
}

function excerpt(text, max) {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

// CanadaBuys addresses a notice by its reference number, lowercased, keeping
// only letters, digits and single hyphens.
function canadaBuysUrl(reference, lang) {
  const slug = reference.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
  return lang === 'fr'
    ? `https://achatscanada.canada.ca/fr/occasions-de-marche/appels-d-offres/${slug}`
    : `https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/${slug}`;
}

const categories = (row) => lines(row.categories).map((c) => CATEGORY_LABEL[c] ?? c);

function tenderSummary(row, lang) {
  return compact({
    reference_number: row.reference_number,
    solicitation_number: row.solicitation_number,
    title: loc(row, 'title', lang),
    buyer: loc(row, 'buyer', lang),
    categories: categories(row),
    notice_type: loc(row, 'notice_type', lang),
    published: row.publication_date,
    closes: row.closing_date,
    regions_of_delivery: capped(lines(loc(row, 'regions_of_delivery', lang)), 4),
    excerpt: excerpt(loc(row, 'description', lang), 240),
    url: canadaBuysUrl(row.reference_number, lang),
  });
}

function tenderDetail(row, lang, maxChars) {
  const langs = lang === 'both' ? ['en', 'fr'] : [lang];
  const out = {
    reference_number: row.reference_number,
    solicitation_number: row.solicitation_number,
    amendment_number: row.amendment_number,
    status: loc(row, 'status', langs[0]),
    categories: categories(row),
    published: row.publication_date,
    closes: row.closing_date,
    amended: row.amendment_date,
    expected_contract_start: row.expected_start_date,
    expected_contract_end: row.expected_end_date,
    unspsc_codes: lines(row.unspsc_codes),
    gsin_codes: lines(row.gsin_codes),
    contact: compact({ name: row.contact_name, email: row.contact_email, phone: row.contact_phone }),
  };
  if (Object.keys(out.contact).length === 0) delete out.contact;
  for (const l of langs) {
    // With both languages every bilingual field is suffixed; a field missing
    // in one language is left out rather than filled from the other.
    const key = (name) => (langs.length > 1 ? `${name}_${l}` : name);
    const get = (col) => (langs.length > 1 ? row[`${col}_${l}`] : loc(row, col, l));
    const description = get('description');
    Object.assign(out, {
      [key('title')]: get('title'),
      [key('buyer')]: get('buyer'),
      [key('buyer_address')]: get('buyer_address'),
      [key('end_users')]: lines(get('end_user')),
      [key('notice_type')]: get('notice_type'),
      [key('procurement_method')]: get('procurement_method'),
      [key('selection_criteria')]: get('selection_criteria'),
      [key('limited_tendering_reason')]: lines(get('limited_tendering_reason')),
      [key('trade_agreements')]: lines(get('trade_agreements')),
      [key('regions_of_opportunity')]: lines(get('regions_of_opportunity')),
      [key('regions_of_delivery')]: lines(get('regions_of_delivery')),
      [key('unspsc')]: lines(get('unspsc')),
      [key('gsin')]: lines(get('gsin')),
      [key('description')]: description.length > maxChars ? `${description.slice(0, maxChars).trimEnd()}…` : description,
      [key('description_truncated')]: description.length > maxChars ? true : '',
      [key('url')]: canadaBuysUrl(row.reference_number, l),
      [key('bidding_url')]: get('notice_url'),
      [key('attachments')]: capped(get('attachments').split(/[\s,;]+/).filter((u) => /^https?:/.test(u)), 25),
    });
  }
  return compact(out);
}

function standingOfferSummary(row, lang) {
  const legal = row.supplier_legal_name;
  const operating = row.supplier_operating_name;
  return compact({
    agreement_number: row.agreement_number,
    agreement_type: loc(row, 'agreement_type', lang),
    title: loc(row, 'title', lang),
    supplier: row.supplier_name || legal,
    supplier_legal_name: legal.toLowerCase() === row.supplier_name.toLowerCase() ? '' : legal,
    supplier_operating_name: operating.toLowerCase() === legal.toLowerCase() ? '' : operating,
    department: loc(row, 'department', lang),
    commodities: capped(lines(loc(row, 'commodity', lang)), 5),
    awarded: row.award_date,
    expires: row.expiry_date,
    delivery_points: capped(lines(loc(row, 'delivery_points', lang)), 6),
  });
}

// Dates in the data are local to the publisher; compare against the local day.
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function page(store, table, { total, rows }, args, warnings, render) {
  const results = rows.map(render);
  return {
    total,
    offset: args.offset,
    returned: results.length,
    ...compact({ next_offset: args.offset + results.length < total ? args.offset + results.length : '' }),
    results,
    ...compact({ source_updated: store.sourceUpdated(table), warnings }),
  };
}

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

/** @param {import('./store.js').Store} store */
export function createTools(store) {
  return [
    {
      name: 'search_tenders',
      title: 'Search open federal tenders',
      description:
        'Search currently open Government of Canada tender notices from CanadaBuys (requests for proposal, ' +
        'standing offer and supply arrangement requests, requests for information, advance contract award notices). ' +
        'Use it to find bidding opportunities by keyword, buyer, category, commodity code, delivery region or closing date. ' +
        'Returns short summaries; call get_tender for full details. With no arguments it lists the tenders closing soonest. ' +
        'Covers federal organizations only.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string', maxLength: 500,
            description: `Keywords searched in titles, descriptions, commodity names and buyer names. ${QUERY_SYNTAX}`,
          },
          match: MATCH,
          category: {
            type: 'array', items: { type: 'string', enum: Object.keys(CATEGORY) },
            description: 'Procurement categories; a notice matching any listed category is returned.',
          },
          buyer: {
            type: 'string', maxLength: 200,
            description: 'Words from the contracting or end-user organization name, in either language, e.g. "National Defence".',
          },
          region: {
            type: 'string', maxLength: 100,
            description:
              'Text contained in a region of delivery, e.g. "Ontario", "National Capital Region", "British Columbia". ' +
              'Nationwide tenders are listed under "Canada" and are not returned for a provincial filter.',
          },
          unspsc: {
            type: 'string', pattern: '^\\d{2,8}$',
            description:
              'UNSPSC commodity code or prefix. A segment or family code such as 43000000 or 4323 also matches every code beneath it.',
          },
          notice_type: {
            type: 'string', maxLength: 100,
            description: 'Text contained in the notice type, e.g. "Request for Proposal", "Request for Information", "Standing Offer".',
          },
          closing_after: { ...DATE, description: 'Only tenders closing on or after this date (YYYY-MM-DD).' },
          closing_before: { ...DATE, description: 'Only tenders closing on or before this date (YYYY-MM-DD).' },
          published_after: { ...DATE, description: 'Only tenders published on or after this date (YYYY-MM-DD).' },
          include_past_deadline: {
            type: 'boolean', default: false,
            description:
              'The source lists some notices as open after their closing date has passed. They are hidden unless this is true.',
          },
          sort: {
            type: 'string', enum: ['relevance', 'closing_soonest', 'newest'],
            description: 'Defaults to relevance when a query is given, otherwise closing_soonest.',
          },
          lang: LANG,
          limit: LIMIT,
          offset: OFFSET,
        },
      },
      annotations: { title: 'Search open federal tenders', ...READ },
      async handler(args) {
        const warnings = await store.refresh('tenders');
        const mapped = { ...args, category: args.category?.map((c) => CATEGORY[c]), today: today() };
        return page(store, 'tenders', searchTenders(store.db, mapped), args, warnings, (r) => tenderSummary(r, args.lang));
      },
    },
    {
      name: 'get_tender',
      title: 'Get tender details',
      description:
        'Get the full record for one open tender notice: description, dates, buyer and end users, selection criteria, ' +
        'trade agreements, commodity codes, contact, attachments and links. Look it up by the reference_number or ' +
        'solicitation_number returned by search_tenders. A solicitation number shared by several notices returns all of them.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string', maxLength: 100, description: 'Reference number or solicitation number, exactly as shown in search results.' },
          lang: { type: 'string', enum: ['en', 'fr', 'both'], default: 'en', description: 'Output language; "both" returns each text field in English and French.' },
          max_description_chars: {
            type: 'integer', minimum: 200, maximum: 50000, default: 6000,
            description: 'Cut the description to this many characters. Raise it when description_truncated is true and you need the rest.',
          },
        },
      },
      annotations: { title: 'Get tender details', ...READ },
      async handler(args) {
        const warnings = await store.refresh('tenders');
        const rows = getTenders(store.db, args.id);
        if (rows.length === 0) {
          throw new InputError(
            `No open tender has reference or solicitation number "${args.id}". It may have closed or been cancelled; ` +
              'only open notices are loaded. Use search_tenders to find current notices.',
          );
        }
        return compact({
          tenders: rows.map((r) => tenderDetail(r, args.lang, args.max_description_chars)),
          source_updated: store.sourceUpdated('tenders'),
          warnings,
        });
      },
    },
    {
      name: 'search_standing_offers',
      title: 'Search standing offers and supply arrangements',
      description:
        'Search active federal standing offers and supply arrangements issued by Public Services and Procurement Canada: ' +
        'pre-qualified suppliers that departments can buy from without a new open competition. Use it to see who already ' +
        'holds an agreement for a commodity, what a given supplier holds, or when agreements expire and may be re-competed. ' +
        'Agreement types: SA (supply arrangement), NMSO and RMSO (national and regional master standing offers), ' +
        'NISO, RISO and DISO (national, regional and departmental individual standing offers).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string', maxLength: 500,
            description: `Keywords searched in agreement titles, commodity names, supplier names and departments. ${QUERY_SYNTAX}`,
          },
          match: MATCH,
          supplier: { type: 'string', maxLength: 200, description: 'Words from the supplier legal, operating or standardized name.' },
          department: { type: 'string', maxLength: 200, description: 'Words from the department the agreement serves, in either language.' },
          commodity: {
            type: 'string', pattern: '^\\d{2,8}$',
            description: 'UNSPSC commodity code or prefix; a segment or family code also matches every code beneath it.',
          },
          agreement_type: { type: 'string', maxLength: 20, description: 'Agreement type code, e.g. SA, NMSO, RMSO, NISO, RISO, DISO.' },
          region: { type: 'string', maxLength: 100, description: 'Text contained in a delivery point, e.g. "Alberta" or "National Capital Region".' },
          include_expired: { type: 'boolean', default: false, description: 'Also return agreements whose expiry date has passed.' },
          lang: LANG,
          limit: LIMIT,
          offset: OFFSET,
        },
      },
      annotations: { title: 'Search standing offers and supply arrangements', ...READ },
      async handler(args) {
        const warnings = await store.refresh('standing_offers');
        const found = searchStandingOffers(store.db, args, today());
        return page(store, 'standing_offers', found, args, warnings, (r) => standingOfferSummary(r, args.lang));
      },
    },
    {
      name: 'data_status',
      title: 'Show data status',
      description:
        'Report which CanadaBuys files are loaded in the local cache, how many records each holds, when the source ' +
        'published them and when they were last checked. Use it to tell the user how current the data is. Does not download anything.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      annotations: { title: 'Show data status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async handler() {
        return store.status();
      },
    },
    {
      name: 'refresh_data',
      title: 'Refresh data from CanadaBuys',
      description:
        'Check CanadaBuys now for newer versions of every data file and download those that changed, replacing the local cache. ' +
        'Searches already refresh on their own schedule (new tenders every 2 hours, open tenders every 6, standing offers daily); ' +
        'call this only when the user asks for the latest data or a search reported a refresh warning.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      annotations: { title: 'Refresh data from CanadaBuys', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      async handler() {
        const warnings = await store.refresh(null, { force: true });
        return compact({ ...store.status(), warnings });
      },
    },
  ];
}

export const PROMPTS = [
  {
    name: 'find_opportunities',
    title: 'Find federal bidding opportunities',
    description: 'Find open Government of Canada tenders that fit a business.',
    arguments: [
      { name: 'business', description: 'What the business sells or does.', required: true },
      { name: 'region', description: 'Where it can deliver, e.g. a province or "Canada".', required: false },
      { name: 'language', description: 'Reply language: en or fr.', required: false },
    ],
    render: ({ business, region, language }) =>
      `Find open Government of Canada tenders that fit this business: ${business}\n` +
      (region ? `It can deliver in: ${region}\n` : '') +
      `\nSteps:\n` +
      `1. List the goods or services it could supply and the English and French terms a buyer would use for them.\n` +
      `2. Run search_tenders several times with those terms joined by OR${region ? ', once filtered to the region and once for region "Canada"' : ''}. Use lang "${language === 'fr' ? 'fr' : 'en'}".\n` +
      `3. Drop poor fits, then call get_tender on the best candidates to confirm scope, selection criteria and closing time.\n` +
      `4. Run search_standing_offers with the same terms to show who already holds related agreements.\n` +
      `5. Present a shortlist as a table: title, buyer, closing date (UTC-05:00), why it fits, link. ` +
      `State the data date from source_updated and that the CanadaBuys page is authoritative.` +
      (language === 'fr' ? '\nReply in French.' : ''),
  },
];
