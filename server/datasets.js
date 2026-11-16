// Source files, the tables they load into, and the mapping from CanadaBuys
// column names to the normalized schema. Multi-value columns are stored as
// newline-separated text; bilingual columns end in _en / _fr.

import { cleanText, multi, quotedList, trim } from './text.js';

const HOUR = 3_600_000;
const PUB = 'https://canadabuys.canada.ca/opendata/pub/';

export const TABLES = {
  tenders: {
    primaryKey: 'reference_number',
    columns: [
      'reference_number', 'amendment_number', 'solicitation_number',
      'title_en', 'title_fr', 'description_en', 'description_fr',
      'publication_date', 'closing_date', 'amendment_date', 'expected_start_date', 'expected_end_date',
      'status_en', 'status_fr', 'categories',
      'notice_type_en', 'notice_type_fr', 'procurement_method_en', 'procurement_method_fr',
      'selection_criteria_en', 'selection_criteria_fr',
      'limited_tendering_reason_en', 'limited_tendering_reason_fr',
      'trade_agreements_en', 'trade_agreements_fr',
      'regions_of_opportunity_en', 'regions_of_opportunity_fr',
      'regions_of_delivery_en', 'regions_of_delivery_fr',
      'unspsc_codes', 'unspsc_en', 'unspsc_fr', 'gsin_codes', 'gsin_en', 'gsin_fr',
      'buyer_en', 'buyer_fr', 'buyer_address_en', 'buyer_address_fr',
      'end_user_en', 'end_user_fr',
      'contact_name', 'contact_email', 'contact_phone',
      'notice_url_en', 'notice_url_fr', 'attachments_en', 'attachments_fr',
    ],
    // Column order here is the bm25 weight order in search.js.
    fts: [
      'title_en', 'title_fr', 'description_en', 'description_fr',
      'unspsc_en', 'unspsc_fr', 'gsin_en', 'gsin_fr',
      'buyer_en', 'buyer_fr', 'end_user_en', 'end_user_fr', 'solicitation_number',
    ],
    indexes: ['closing_date', 'publication_date', 'solicitation_number'],
  },
  standing_offers: {
    primaryKey: null,
    columns: [
      'agreement_number', 'agreement_type_en', 'agreement_type_fr', 'title_en', 'title_fr',
      'commodity_codes', 'commodity_en', 'commodity_fr',
      'supplier_name', 'supplier_legal_name', 'supplier_operating_name',
      'department_en', 'department_fr', 'award_date', 'expiry_date',
      'delivery_point_codes', 'delivery_points_en', 'delivery_points_fr',
    ],
    fts: [
      'title_en', 'title_fr', 'commodity_en', 'commodity_fr',
      'supplier_name', 'supplier_legal_name', 'supplier_operating_name',
      'department_en', 'department_fr', 'agreement_number',
    ],
    indexes: ['expiry_date', 'agreement_number'],
  },
};

function address(get, lang) {
  const province = get(`contractingEntityAddressProvince-entiteContractanteAdresseProvince-${lang}`);
  const postal = get('contractingEntityAddressPostalCode-entiteContractanteAdresseCodePostal');
  return [
    get(`contractingEntityAddressLine-ligneAdresseEntiteContractante-${lang}`),
    get(`contractingEntityAddressCity-entiteContractanteAdresseVille-${lang}`),
    [province, postal].map(trim).filter(Boolean).join(' '),
    get(`contractingEntityAddressCountry-entiteContractanteAdressePays-${lang}`),
  ].map(trim).filter(Boolean).join(', ');
}

// Source timestamps are local to UTC-05:00 year-round and carry no offset.
function closing(s) {
  const v = trim(s);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v) ? `${v}-05:00` : v;
}

async function* tenderRows(recs) {
  for await (const get of recs) {
    yield {
      reference_number: trim(get('referenceNumber-numeroReference')),
      amendment_number: trim(get('amendmentNumber-numeroModification')),
      solicitation_number: trim(get('solicitationNumber-numeroSollicitation')),
      title_en: cleanText(get('title-titre-eng')),
      title_fr: cleanText(get('title-titre-fra')),
      description_en: cleanText(get('tenderDescription-descriptionAppelOffres-eng')),
      description_fr: cleanText(get('tenderDescription-descriptionAppelOffres-fra')),
      publication_date: trim(get('publicationDate-datePublication')),
      closing_date: closing(get('tenderClosingDate-appelOffresDateCloture')),
      amendment_date: trim(get('amendmentDate-dateModification')),
      expected_start_date: trim(get('expectedContractStartDate-dateDebutContratPrevue')),
      expected_end_date: trim(get('expectedContractEndDate-dateFinContratPrevue')),
      status_en: trim(get('tenderStatus-appelOffresStatut-eng')),
      status_fr: trim(get('tenderStatus-appelOffresStatut-fra')),
      categories: multi(get('procurementCategory-categorieApprovisionnement')),
      notice_type_en: trim(get('noticeType-avisType-eng')),
      notice_type_fr: trim(get('noticeType-avisType-fra')),
      procurement_method_en: trim(get('procurementMethod-methodeApprovisionnement-eng')),
      procurement_method_fr: trim(get('procurementMethod-methodeApprovisionnement-fra')),
      selection_criteria_en: trim(get('selectionCriteria-criteresSelection-eng')),
      selection_criteria_fr: trim(get('selectionCriteria-criteresSelection-fra')),
      limited_tendering_reason_en: multi(get('limitedTenderingReason-raisonAppelOffresLimite-eng')),
      limited_tendering_reason_fr: multi(get('limitedTenderingReason-raisonAppelOffresLimite-fra')),
      trade_agreements_en: multi(get('tradeAgreements-accordsCommerciaux-eng')),
      trade_agreements_fr: multi(get('tradeAgreements-accordsCommerciaux-fra')),
      regions_of_opportunity_en: multi(get('regionsOfOpportunity-regionAppelOffres-eng')),
      regions_of_opportunity_fr: multi(get('regionsOfOpportunity-regionAppelOffres-fra')),
      regions_of_delivery_en: multi(get('regionsOfDelivery-regionsLivraison-eng')),
      regions_of_delivery_fr: multi(get('regionsOfDelivery-regionsLivraison-fra')),
      unspsc_codes: multi(get('unspsc')),
      unspsc_en: multi(get('unspscDescription-eng')),
      unspsc_fr: multi(get('unspscDescription-fra')),
      gsin_codes: multi(get('gsin-nibs')),
      gsin_en: multi(get('gsinDescription-nibsDescription-eng')),
      gsin_fr: multi(get('gsinDescription-nibsDescription-fra')),
      buyer_en: trim(get('contractingEntityName-nomEntitContractante-eng')),
      buyer_fr: trim(get('contractingEntityName-nomEntitContractante-fra')),
      buyer_address_en: address(get, 'eng'),
      buyer_address_fr: address(get, 'fra'),
      end_user_en: multi(get('endUserEntitiesName-nomEntitesUtilisateurFinal-eng')),
      end_user_fr: multi(get('endUserEntitiesName-nomEntitesUtilisateurFinal-fra')),
      contact_name: trim(get('contactInfoName-informationsContactNom')),
      contact_email: trim(get('contactInfoEmail-informationsContactCourriel')),
      contact_phone: trim(get('contactInfoPhone-contactInfoTelephone')),
      notice_url_en: trim(get('noticeURL-URLavis-eng')),
      notice_url_fr: trim(get('noticeURL-URLavis-fra')),
      attachments_en: trim(get('attachment-piecesJointes-eng')),
      attachments_fr: trim(get('attachment-piecesJointes-fra')),
    };
  }
}

// The source has one row per agreement per delivery point; collapse to one row
// per agreement and supplier with the delivery points merged.
async function* standingOfferRows(recs) {
  const merged = new Map();
  for await (const get of recs) {
    const row = {
      agreement_number: trim(get('agreement-number')),
      agreement_type_en: trim(get('agreement-type_en')),
      agreement_type_fr: trim(get('agreement-type_fr')),
      title_en: cleanText(get('sosa-description_en')),
      title_fr: cleanText(get('sosa-description_fr')),
      commodity_codes: quotedList(get('commodity')),
      commodity_en: quotedList(get('commodity-description_en')),
      commodity_fr: quotedList(get('commodity-description_fr')),
      supplier_name: trim(get('supplier-standardized-name')),
      supplier_legal_name: trim(get('supplier-legal-name')),
      supplier_operating_name: trim(get('supplier-operating-name')),
      department_en: trim(get('end-user-entity_en')),
      department_fr: trim(get('end-user-entity_fr')),
      award_date: trim(get('award-date')),
      expiry_date: trim(get('expiry-date')),
    };
    const key = JSON.stringify(row);
    let entry = merged.get(key);
    if (!entry) merged.set(key, (entry = { row, points: new Map() }));
    const code = trim(get('delivery-point-code'));
    entry.points.set(code, [trim(get('delivery-point_en')), trim(get('delivery-point_fr'))]);
  }
  for (const { row, points } of merged.values()) {
    yield {
      ...row,
      delivery_point_codes: [...points.keys()].join('\n'),
      delivery_points_en: [...points.values()].map((p) => p[0]).filter(Boolean).join('\n'),
      delivery_points_fr: [...points.values()].map((p) => p[1]).filter(Boolean).join('\n'),
    };
  }
}

// `ttl` is how long a successful check is trusted before the next conditional
// request. `onConflict` decides which file wins when both carry a notice.
export const FILES = [
  {
    id: 'open_tenders',
    label: 'Open tender notices',
    url: `${PUB}openTenderNotice-ouvertAvisAppelOffres.csv`,
    table: 'tenders',
    rows: tenderRows,
    onConflict: 'REPLACE',
    ttl: 6 * HOUR,
    required: true,
  },
  {
    // Published every two hours; may be empty early in the day and may hold
    // notices the daily open file has not picked up yet.
    id: 'new_tenders',
    label: 'New tender notices',
    url: `${PUB}newTenderNotice-nouvelAvisAppelOffres.csv`,
    table: 'tenders',
    rows: tenderRows,
    onConflict: 'IGNORE',
    ttl: 2 * HOUR,
    required: false,
  },
  {
    id: 'standing_offers',
    label: 'Active standing offers and supply arrangements',
    url: 'https://sosa.canadabuys.canada.ca/cds/opendata/tpsgc-pwgsc_ocama-sosa.csv',
    table: 'standing_offers',
    rows: standingOfferRows,
    onConflict: 'REPLACE',
    ttl: 24 * HOUR,
    required: true,
  },
];
