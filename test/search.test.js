import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FILES } from '../server/datasets.js';
import {
  ftsQuery, getAwards, getTenders, searchAwards, searchStandingOffers, searchTenders, summarizeAwards,
} from '../server/search.js';
import { Store } from '../server/store.js';
import { cleanText } from '../server/text.js';

const [OPEN, NEW, SOSA] = FILES;
const TODAY = '2026-11-16';
const DEFAULTS = { limit: 10, offset: 0, today: TODAY };

async function* from(rows) {
  for (const row of rows) yield (column) => row[column] ?? '';
}

async function load(store, file, rows) {
  const mapped = [];
  for await (const row of file.rows(from(rows))) mapped.push(row);
  store.load(file, mapped);
}

const tender = (ref, fields) => ({
  'referenceNumber-numeroReference': ref,
  'amendmentNumber-numeroModification': '000',
  'tenderClosingDate-appelOffresDateCloture': '2026-12-01T14:00:00',
  'tenderStatus-appelOffresStatut-eng': 'Open',
  ...fields,
});

async function tenderStore() {
  const store = new Store(':memory:');
  await load(store, OPEN, [
    tender('cb-1', {
      'title-titre-eng': 'Structural repairs',
      'title-titre-fra': 'Réparations structurelles',
      'tenderDescription-descriptionAppelOffres-fra': 'Travaux de r&eacute;fection<br />du b&acirc;timent',
      'contractingEntityName-nomEntitContractante-fra': 'Ministère de la Défense nationale (MDN)',
      'procurementCategory-categorieApprovisionnement': '*CNST\n*SRV',
      unspsc: '*72141200\n*43232407',
    }),
    tender('cb-2', {
      'title-titre-eng': 'Translation services',
      'contractingEntityName-nomEntitContractante-eng': 'Parks Canada Agency (PC)',
      'procurementCategory-categorieApprovisionnement': '*SRV',
      unspsc: '*82111800',
    }),
    tender('cb-3', {
      'title-titre-eng': 'Translation of old manuals',
      'tenderClosingDate-appelOffresDateCloture': '2023-07-12T10:00:00',
    }),
  ]);
  return store;
}

const refs = (found) => found.rows.map((r) => r.reference_number).sort();

test('free text matches either language without accents and decodes HTML entities', async () => {
  const store = await tenderStore();
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, query: 'reparations' })), ['cb-1']);
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, query: 'batiment refection' })), ['cb-1']);
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, query: 'repairs OR translation' })), ['cb-1', 'cb-2']);
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, query: 'repairs translation', match: 'any' })), ['cb-1', 'cb-2']);
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, query: 'repairs translation' })), []);
});

test('query text is never interpreted as FTS syntax', async () => {
  const store = await tenderStore();
  for (const query of ['((( " AND NEAR( title:x ^y', 'repairs" OR "', '-repairs', 'col:repairs*)', 'a AND OR b']) {
    assert.doesNotThrow(() => searchTenders(store.db, { ...DEFAULTS, query }), query);
  }
  assert.equal(ftsQuery('"--" ***'), null);
});

test('filters: buyer in either language, category, UNSPSC family, past deadlines', async () => {
  const store = await tenderStore();
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, buyer: 'defense nationale' })), ['cb-1']);
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, category: ['CNST'] })), ['cb-1']);
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, category: ['SRV'] })), ['cb-1', 'cb-2']);
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, unspsc: '43000000' })), ['cb-1']);
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, unspsc: '8211' })), ['cb-2']);
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, query: 'translation' })), ['cb-2']);
  assert.deepEqual(
    refs(searchTenders(store.db, { ...DEFAULTS, query: 'translation', include_past_deadline: true })),
    ['cb-2', 'cb-3'],
  );
  assert.equal(searchTenders(store.db, { ...DEFAULTS, closing_before: '2026-12-01' }).total, 2);
  assert.deepEqual(refs({ rows: getTenders(store.db, ' CB-1 ') }), ['cb-1']);
});

test('the new-notices file adds notices without overriding or outliving the open file', async () => {
  const store = await tenderStore();
  await load(store, NEW, [
    tender('cb-1', { 'title-titre-eng': 'Stale copy' }),
    tender('cb-9', { 'title-titre-eng': 'Fresh notice' }),
  ]);
  const all = () => searchTenders(store.db, { ...DEFAULTS, include_past_deadline: true });
  assert.deepEqual(refs(all()), ['cb-1', 'cb-2', 'cb-3', 'cb-9']);
  assert.equal(all().rows.find((r) => r.reference_number === 'cb-1').title_en, 'Structural repairs');
  assert.deepEqual(refs(searchTenders(store.db, { ...DEFAULTS, query: 'fresh' })), ['cb-9']);

  await load(store, NEW, []);
  assert.deepEqual(refs(all()), ['cb-1', 'cb-2', 'cb-3']);
  assert.equal(searchTenders(store.db, { ...DEFAULTS, query: 'fresh' }).total, 0);
});

test('standing offers collapse to one row per agreement with delivery points merged', async () => {
  const store = new Store(':memory:');
  const offer = (point, expiry = '2027-01-31') => ({
    'agreement-number': 'CW1',
    'agreement-type_en': 'NMSO',
    'sosa-description_en': 'Light duty vehicles',
    'sosa-description_fr': 'Véhicules légers',
    commodity: '"25100000; 25101500"',
    'supplier-standardized-name': 'ACME MOTORS',
    'expiry-date': expiry,
    'delivery-point-code': point,
    'delivery-point_en': point,
  });
  await load(store, SOSA, [offer('Alberta'), offer('Ontario'), { ...offer('Yukon', '2026-01-01'), 'agreement-number': 'CW2' }]);

  const active = searchStandingOffers(store.db, { ...DEFAULTS, query: 'vehicules' }, TODAY);
  assert.equal(active.total, 1);
  assert.equal(active.rows[0].delivery_points_en, 'Alberta\nOntario');
  assert.equal(active.rows[0].commodity_codes, '25100000\n25101500');
  assert.equal(searchStandingOffers(store.db, { ...DEFAULTS, commodity: '2510', include_expired: true }, TODAY).total, 2);
  assert.equal(searchStandingOffers(store.db, { ...DEFAULTS, supplier: 'acme', region: 'ontario' }, TODAY).total, 1);
});

async function awardStore() {
  const [first, second] = FILES.filter((f) => f.table === 'awards');
  const award = (ref, supplier, fields) => ({
    'referenceNumber-numeroReference': ref,
    'supplierLegalName-nomLegalFournisseur-eng': supplier,
    'contractCurrency-contratMonnaie': 'CAD',
    'awardStatus-attributionStatut-eng': 'Active',
    'procurementMethod-methodeApprovisionnement-eng': 'Competitive - Open bidding',
    'contractAwardDate-dateAttributionContrat': '2025-06-01',
    ...fields,
  });
  const store = new Store(':memory:');
  await load(store, first, [
    award('aw-1', 'Acme Inc.', {
      'title-titre-fra': 'Services de déneigement',
      'solicitationNumber-numeroSollicitation': 'SOL-1',
      'contractNumber-numeroContrat': 'C-1',
      'contractAmount-montantContrat': '0.00',
      'totalContractValue-valeurTotaleContrat': '300000.50',
    }),
    award('aw-2', 'ACME INC', {
      'solicitationNumber-numeroSollicitation': 'SOL-1',
      'contractAmount-montantContrat': '100000.00',
      'totalContractValue-valeurTotaleContrat': '0.00',
      'procurementMethod-methodeApprovisionnement-eng': 'Non-competitive',
    }),
  ]);
  await load(store, second, [
    award('aw-3', 'Borealis Ltd', { 'totalContractValue-valeurTotaleContrat': '900000', 'contractCurrency-contratMonnaie': 'USD' }),
    award('aw-4', 'Borealis Ltd', { 'instrumentType-typeInstrument-eng': 'Standing Offer' }),
    award('aw-5', 'Borealis Ltd', { 'totalContractValue-valeurTotaleContrat': '5', 'awardStatus-attributionStatut-eng': 'Cancelled' }),
  ]);
  return store;
}

test('awards: value falls back to the amount, and filters do not confuse the two procurement methods', async () => {
  const store = await awardStore();
  const search = (a) => searchAwards(store.db, { ...DEFAULTS, ...a });
  assert.deepEqual(search({ sort: 'highest_value' }).rows.map((r) => [r.reference_number, r.value]), [
    ['aw-3', 900000], ['aw-1', 300000.5], ['aw-2', 100000], ['aw-4', 0],
  ]);
  assert.deepEqual(refs(search({ include_cancelled: true })), ['aw-1', 'aw-2', 'aw-3', 'aw-4', 'aw-5']);
  assert.deepEqual(refs(search({ supplier: 'acme', competitive: true })), ['aw-1']);
  assert.deepEqual(refs(search({ competitive: false })), ['aw-2']);
  assert.deepEqual(refs(search({ query: 'deneigement' })), ['aw-1']);
  assert.deepEqual(refs(search({ min_value: 200000 })), ['aw-1', 'aw-3']);
  assert.deepEqual(refs(search({ max_value: 200000 })), ['aw-2']);
  assert.deepEqual(refs(getAwards(store.db, 'sol-1', 20)), ['aw-1', 'aw-2']);
  assert.deepEqual(refs(getAwards(store.db, 'C-1', 20)), ['aw-1']);
});

test('award summaries merge name variants and total Canadian dollars only', async () => {
  const store = await awardStore();
  const { overall, rows } = summarizeAwards(store.db, { ...DEFAULTS, group_by: 'supplier', sort: 'total_value', lang: 'en' });
  assert.deepEqual(
    rows.map((r) => [r.name.toUpperCase().replace('.', ''), r.awards, r.total_value_cad]),
    [['ACME INC', 2, 400000.5], ['BOREALIS LTD', 2, 0]],
  );
  assert.deepEqual({ ...overall }, { awards: 4, groups: 2, total_value_cad: 400000.5, without_value: 1, other_currency: 1 });
});

test('cleanText keeps comparison signs that are not tags', () => {
  assert.equal(cleanText('Load &lt; 5 t<br/>and x < 3 > y&nbsp;&#233;&#xE9;&bogus;'), 'Load < 5 t\nand x < 3 > y éé&bogus;');
});
