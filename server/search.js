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

function run(db, table, { match, where, params, order, limit, offset }) {
  const fts = `${table}_fts`;
  const from = match.length
    ? `${fts} JOIN ${table} t ON t.rowid = ${fts}.rowid WHERE ${fts} MATCH ?`
    : `${table} t WHERE 1`;
  const filter = where.map((w) => ` AND ${w}`).join('');
  const args = match.length ? [match.join(' AND '), ...params] : params;
  const total = db.prepare(`SELECT count(*) AS n FROM ${from}${filter}`).get(...args).n;
  const rows = db
    .prepare(`SELECT t.* FROM ${from}${filter} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, limit, offset);
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

/** Notices whose reference or solicitation number equals `id`, newest amendment first. */
export function getTenders(db, id) {
  return db
    .prepare(
      `SELECT * FROM tenders WHERE reference_number = ?1 COLLATE NOCASE OR solicitation_number = ?1 COLLATE NOCASE
       ORDER BY publication_date DESC LIMIT 20`,
    )
    .all(id.trim());
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

for (const [table, weights] of Object.entries(WEIGHTS)) {
  if (weights.length !== TABLES[table].fts.length) throw new Error(`bm25 weights out of step with ${table} fts columns`);
}
