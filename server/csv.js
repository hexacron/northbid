// Streaming RFC 4180 parser. Fields may contain quoted commas, quotes ("") and
// newlines; input arrives as arbitrary string chunks.

/**
 * @param {AsyncIterable<string> | Iterable<string>} chunks
 * @returns {AsyncGenerator<string[]>} one array of fields per record
 */
export async function* parseCsv(chunks) {
  let carry = '';
  let field = '';
  let row = [];
  let inQuotes = false;
  let first = true;

  // Consumes `text`; when not `final`, stops before a trailing `"` or `\r`
  // whose meaning depends on the next chunk and leaves it in `carry`.
  function* consume(text, final) {
    const n = text.length;
    let i = 0;
    let start = 0;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (inQuotes) {
        if (c !== 34) { i++; continue; }
        if (i + 1 === n && !final) break;
        field += text.slice(start, i);
        if (text.charCodeAt(i + 1) === 34) { field += '"'; i += 2; } else { inQuotes = false; i++; }
        start = i;
      } else if (c === 34) {
        field += text.slice(start, i);
        inQuotes = true;
        start = ++i;
      } else if (c === 44) {
        row.push(field + text.slice(start, i));
        field = '';
        start = ++i;
      } else if (c === 10 || c === 13) {
        if (c === 13 && i + 1 === n && !final) break;
        row.push(field + text.slice(start, i));
        field = '';
        i += c === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
        start = i;
        yield row;
        row = [];
      } else {
        i++;
      }
    }
    field += text.slice(start, i);
    carry = text.slice(i);
  }

  for await (let chunk of chunks) {
    if (first) {
      first = false;
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
    }
    yield* consume(carry + chunk, false);
  }
  yield* consume(carry, true);
  if (field !== '' || row.length > 0) {
    row.push(field);
    yield row;
  }
}

/**
 * Reads a CSV with a header row and yields one accessor per record. The
 * accessor throws on an unknown column so an upstream format change fails
 * loudly instead of loading blanks.
 * @param {AsyncIterable<string> | Iterable<string>} chunks
 * @returns {AsyncGenerator<(column: string) => string>}
 */
export async function* records(chunks) {
  let index = null;
  for await (const row of parseCsv(chunks)) {
    if (!index) {
      index = new Map(row.map((name, i) => [name.trim(), i]));
      continue;
    }
    if (row.length === 1 && row[0] === '') continue;
    yield (column) => {
      const i = index.get(column);
      if (i === undefined) throw new Error(`source file has no "${column}" column; its format may have changed`);
      return row[i] ?? '';
    };
  }
}
