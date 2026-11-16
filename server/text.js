// Text clean-up for CanadaBuys fields: HTML entities and tags in free text,
// and the `*value` / newline convention used for multi-value cells.

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', thinsp: ' ', ensp: ' ', emsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', sbquo: '‚', bdquo: '„',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', deg: '°', sup2: '²', sup3: '³',
  frac12: '½', frac14: '¼', frac34: '¾', plusmn: '±', times: '×', divide: '÷', micro: 'µ',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', cent: '¢', sect: '§', para: '¶',
  oelig: 'œ', OElig: 'Œ', aelig: 'æ', AElig: 'Æ', szlig: 'ß', ccedil: 'ç', Ccedil: 'Ç',
  ntilde: 'ñ', Ntilde: 'Ñ', yuml: 'ÿ', Yuml: 'Ÿ', shy: '', zwnj: '', zwj: '',
};
// Accented vowels follow a regular naming scheme: &eacute; &Egrave; &ocirc; …
const ACCENTS = { acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', tilde: '\u0303', ring: '\u030a' };
for (const letter of 'aeiouyAEIOUY') {
  for (const [name, mark] of Object.entries(ACCENTS)) {
    NAMED[letter + name] ??= (letter + mark).normalize('NFC');
  }
}

/** @param {string} s */
export function decodeEntities(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body) => {
    if (body[0] !== '#') return NAMED[body] ?? whole;
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** Free text: strips tags, decodes entities, normalizes whitespace. */
export function cleanText(s) {
  if (!s) return '';
  return decodeEntities(
    s.replace(/<br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])>/gi, '\n').replace(/<\/?[a-z][^<>]*>/gi, ''),
  )
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Single-value cell. */
export function trim(s) {
  return s ? decodeEntities(s).trim() : '';
}

/** Multi-value cell (`*A\n*B`) to newline-separated values without the marker. */
export function multi(s) {
  if (!s) return '';
  return s
    .split('\n')
    .map((v) => decodeEntities(v.replace(/^\s*\*/, '')).trim())
    .filter(Boolean)
    .join('\n');
}

/** Standing-offer cell (`"A; B"` with literal quotes) to newline-separated values. */
export function quotedList(s) {
  if (!s) return '';
  return s
    .replace(/^\s*"|"\s*$/g, '')
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean)
    .join('\n');
}

/** Newline-separated storage form back to an array. */
export function lines(s) {
  return s ? s.split('\n') : [];
}
