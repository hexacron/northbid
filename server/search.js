// Query construction over the normalized tables. Free text goes through FTS5
// (diacritic-insensitive, both languages at once); everything else is plain SQL.

import { TABLES } from './datasets.js';

/** Raised for problems the caller can fix by changing the arguments. */
export class InputError extends Error {}

/**
 * Turns user text into an FTS5 expression. Bare words and "quoted phrases"
 * become quoted terms, `word*` is a prefix match, and an uppercase OR between
 * two terms is kept. Everything else is literal, so no input is a syntax error.
 * @param {string} text
 * @param {'all' | 'any'} [match] how terms without an explicit OR combine
 * @returns {string | null} null when the text has nothing searchable
 */
export function ftsQuery(text, match = 'all') {
  const parts = [];
  let or = false;
  for (const m of text.matchAll(/"([^"]*)"|(\S+)/g)) {
    if (m[2] === 'OR') { or = parts.length > 0; continue; }
    if (m[2] === 'AND') continue;
    const prefix = m[2] !== undefined && m[2].endsWith('*');
    const raw = (m[1] ?? m[2]).replace(/["*]/g, ' ').trim();
    if (!/[\p{L}\p{N}]/u.test(raw)) continue;
    if (parts.length) parts.push(or || match === 'any' ? 'OR' : 'AND');
    parts.push(`"${raw}"${prefix ? '*' : ''}`);
    or = false;
  }
  return parts.length ? parts.join(' ') : null;
}

// bm25 weights, in TABLES[...].fts column order.
const WEIGHTS = {
  tenders: [10, 10, 1, 1, 4, 4, 4, 4, 2, 2, 2, 2, 6],
  standing_offers: [8, 8, 4, 4, 6, 6, 6, 2, 2, 6],
  awards: [10, 10, 1, 1, 4, 4, 6, 2, 2, 2, 2, 6, 6],
};

function required(text, name, match = 'all') {
  const q = ftsQuery(text, match);
  if (!q) throw new InputError(`"${name}" has no searchable words; use letters or digits.`);
  return q;
}

// A value stored as one line of a newline-separated column.
const hasLine = (col) => `instr(char(10) || ${col} || char(10), char(10) || ? || char(10)) > 0`;
// A code prefix at the start of any line.
const hasLinePrefix = (col) => `instr(char(10) || ${col}, char(10) || ?) > 0`;
const likeEither = (col) => `(${col}_en LIKE ? ESCAPE '\\' OR ${col}_fr LIKE ? ESCAPE '\\')`;
const like = (s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

// UNSPSC codes are four two-digit levels padded with zeros: 43000000 is a
// segment, 43230000 a family. Dropping the padding gives the prefix to match.
function unspscPrefix(code) {
  const prefix = code.replace(/(00)+$/, '');
  if (!prefix) throw new InputError('"unspsc" must not be all zeros.');
  return prefix;
}

// The FROM and WHERE of a filtered query over `table`, aliased `t`.
function scope(table, { match, where, params }) {
  const fts = `${table}_fts`;
  const from = match.length
    ? `${fts} JOIN ${table} t ON t.rowid = ${fts}.rowid WHERE ${fts} MATCH ?`
    : `${table} t WHERE 1`;
  return {
    sql: from + where.map((w) => ` AND ${w}`).join(''),
    args: match.length ? [match.join(' AND '), ...params] : params,
  };
}

function run(db, table, { match, where, params, order, limit, offset }) {
  const { sql, args } = scope(table, { match, where, params });
  const total = db.prepare(`SELECT count(*) AS n FROM ${sql}`).get(...args).n;
  const rows = db.prepare(`SELECT t.* FROM ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset);
  return { total, rows };
}

/** @param {import('node:sqlite').DatabaseSync} db */
export function searchTenders(db, a) {
  const match = [];
  const where = [];
  const params = [];
  if (a.query) match.push(`(${required(a.query, 'query', a.match)})`);
  if (a.buyer) match.push(`{buyer_en buyer_fr end_user_en end_user_fr} : (${required(a.buyer, 'buyer')})`);
  if (a.category?.length) {
    where.push(`(${a.category.map(() => hasLine('t.categories')).join(' OR ')})`);
    params.push(...a.category);
  }
  if (a.unspsc) {
    where.push(hasLinePrefix('t.unspsc_codes'));
    params.push(unspscPrefix(a.unspsc));
  }
  if (a.region) {
    where.push(likeEither('t.regions_of_delivery'));
    params.push(like(a.region), like(a.region));
  }
  if (a.notice_type) {
    where.push(likeEither('t.notice_type'));
    params.push(like(a.notice_type), like(a.notice_type));
  }
  if (a.closing_after) { where.push('t.closing_date >= ?'); params.push(a.closing_after); }
  // Closing timestamps sort after their own date, so compare against the day's end.
  if (a.closing_before) { where.push('t.closing_date <= ?'); params.push(`${a.closing_before}T23:59:59-05:00`); }
  if (a.published_after) { where.push('t.publication_date >= ?'); params.push(a.published_after); }
  if (!a.include_past_deadline) { where.push('t.closing_date >= ?'); params.push(a.today); }

  const sort = a.sort ?? (a.query ? 'relevance' : 'closing_soonest');
  const order = {
    relevance: a.query ? `bm25(tenders_fts, ${WEIGHTS.tenders.join(', ')})` : 't.closing_date',
    closing_soonest: 't.closing_date',
    newest: 't.publication_date DESC',
  }[sort];
  return run(db, 'tenders', {
    match, where, params, order: `${order}, t.reference_number`, limit: a.limit, offset: a.offset,
  });
}

// Lookups repeat a plain `?` per comparison: numbered parameters (`?1`) fail
// to bind on Node 22.16.

/** Notices whose reference or solicitation number equals `id`, newest amendment first. */
export function getTenders(db, id) {
  const key = id.trim();
  return db
    .prepare(
      `SELECT * FROM tenders WHERE reference_number = ? COLLATE NOCASE OR solicitation_number = ? COLLATE NOCASE
       ORDER BY publication_date DESC LIMIT 20`,
    )
    .all(key, key);
}

/** @param {import('node:sqlite').DatabaseSync} db */
export function searchStandingOffers(db, a, today) {
  const match = [];
  const where = [];
  const params = [];
  if (a.query) match.push(`(${required(a.query, 'query', a.match)})`);
  if (a.supplier) {
    match.push(`{supplier_name supplier_legal_name supplier_operating_name} : (${required(a.supplier, 'supplier')})`);
  }
  if (a.department) match.push(`{department_en department_fr} : (${required(a.department, 'department')})`);
  if (a.commodity) {
    where.push(hasLinePrefix('t.commodity_codes'));
    params.push(unspscPrefix(a.commodity));
  }
  if (a.agreement_type) { where.push('t.agreement_type_en = ? COLLATE NOCASE'); params.push(a.agreement_type); }
  if (a.region) {
    where.push(likeEither('t.delivery_points'));
    params.push(like(a.region), like(a.region));
  }
  if (!a.include_expired) { where.push('t.expiry_date >= ?'); params.push(today); }
  const order = a.query ? `bm25(standing_offers_fts, ${WEIGHTS.standing_offers.join(', ')})` : 't.expiry_date DESC';
  return run(db, 'standing_offers', {
    match, where, params, order: `${order}, t.agreement_number`, limit: a.limit, offset: a.offset,
  });
}

function awardFilters(a) {
  const match = [];
  const where = [];
  const params = [];
  if (a.query) match.push(`(${required(a.query, 'query', a.match)})`);
  if (a.supplier) match.push(`{supplier_name} : (${required(a.supplier, 'supplier')})`);
  if (a.buyer) match.push(`{buyer_en buyer_fr end_user_en end_user_fr} : (${required(a.buyer, 'buyer')})`);
  if (a.category?.length) {
    where.push(`(${a.category.map(() => hasLine('t.categories')).join(' OR ')})`);
    params.push(...a.category);
  }
  if (a.unspsc) {
    where.push(hasLinePrefix('t.unspsc_codes'));
    params.push(unspscPrefix(a.unspsc));
  }
  if (a.region) {
    where.push(likeEither('t.regions_of_delivery'));
    params.push(like(a.region), like(a.region));
  }
  // "Non-competitive" contains "Competitive", so match on the start of the value.
  if (a.competitive === true) where.push(`t.procurement_method_en LIKE 'Competitive%'`);
  if (a.competitive === false) {
    where.push(`t.procurement_method_en IN ('Non-competitive', 'Advance contract award notice')`);
  }
  if (a.awarded_after) { where.push('t.award_date >= ?'); params.push(a.awarded_after); }
  if (a.awarded_before) { where.push('t.award_date <= ?'); params.push(a.awarded_before); }
  if (a.min_value !== undefined) { where.push('t.value >= ?'); params.push(a.min_value); }
  if (a.max_value !== undefined) { where.push('t.value > 0 AND t.value <= ?'); params.push(a.max_value); }
  if (!a.include_cancelled) where.push(`t.status_en <> 'Cancelled'`);
  return { match, where, params };
}

/** @param {import('node:sqlite').DatabaseSync} db */
export function searchAwards(db, a) {
  const sort = a.sort ?? (a.query ? 'relevance' : 'newest');
  const order = {
    relevance: a.query ? `bm25(awards_fts, ${WEIGHTS.awards.join(', ')})` : 't.award_date DESC',
    newest: 't.award_date DESC',
    highest_value: 't.value DESC',
  }[sort];
  return run(db, 'awards', {
    ...awardFilters(a), order: `${order}, t.reference_number`, limit: a.limit, offset: a.offset,
  });
}

/** Award notices whose reference, solicitation or contract number equals `id`, newest first. */
export function getAwards(db, id, limit) {
  const sql = `FROM awards WHERE reference_number = ? COLLATE NOCASE OR solicitation_number = ? COLLATE NOCASE
    OR contract_number = ? COLLATE NOCASE`;
  const key = id.trim();
  return {
    total: db.prepare(`SELECT count(*) AS n ${sql}`).get(key, key, key).n,
    rows: db.prepare(`SELECT * ${sql} ORDER BY award_date DESC, reference_number LIMIT ?`).all(key, key, key, limit),
  };
}

// Supplier names are grouped ignoring case, periods and commas ("Acme Inc."
// and "ACME INC"); other spelling variants of one company stay separate.
// Only Canadian-dollar values are summed.
const GROUPS = {
  supplier: {
    key: `replace(replace(upper(t.supplier_name), '.', ''), ',', '')`,
    name: () => 'max(t.supplier_name)',
  },
  buyer: { key: 't.buyer_en', name: (lang) => (lang === 'fr' ? `max(coalesce(nullif(t.buyer_fr, ''), t.buyer_en))` : 't.buyer_en') },
  year: { key: 'substr(t.award_date, 1, 4)', name: () => 'substr(t.award_date, 1, 4)' },
};

/**
 * Award counts and Canadian-dollar totals per supplier, buyer or award year.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function summarizeAwards(db, a) {
  const group = GROUPS[a.group_by];
  const { sql, args } = scope('awards', awardFilters(a));
  const cad = `CASE WHEN t.currency = 'CAD' THEN t.value ELSE 0 END`;
  const order = { total_value: 'total_value_cad DESC, awards DESC', awards: 'awards DESC, total_value_cad DESC' }[a.sort];
  const overall = db
    .prepare(
      `SELECT count(*) AS awards, count(DISTINCT ${group.key}) AS groups, coalesce(sum(${cad}), 0) AS total_value_cad,
         coalesce(sum(t.value = 0), 0) AS without_value,
         coalesce(sum(t.value > 0 AND t.currency <> 'CAD'), 0) AS other_currency
       FROM ${sql}`,
    )
    .get(...args);
  const rows = db
    .prepare(
      `SELECT ${group.name(a.lang)} AS name, count(*) AS awards, sum(${cad}) AS total_value_cad,
         max(${cad}) AS largest_value_cad, min(t.award_date) AS first_award, max(t.award_date) AS latest_award
       FROM ${sql} GROUP BY ${group.key} ORDER BY ${a.group_by === 'year' ? 'name DESC' : order}, name
       LIMIT ? OFFSET ?`,
    )
    .all(...args, a.limit, a.offset);
  return { overall, rows };
}

for (const [table, weights] of Object.entries(WEIGHTS)) {
  if (weights.length !== TABLES[table].fts.length) throw new Error(`bm25 weights out of step with ${table} fts columns`);
}
