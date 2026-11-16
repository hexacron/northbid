import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv, records } from '../server/csv.js';

async function collect(iterable) {
  const out = [];
  for await (const item of iterable) out.push(item);
  return out;
}

const SAMPLE = '\ufeff"a","b","c"\r\n"1","say ""hi"", ok","line one\nline two"\r\n,"",plain\n"é","\r\n",""';
const EXPECTED = [
  ['a', 'b', 'c'],
  ['1', 'say "hi", ok', 'line one\nline two'],
  ['', '', 'plain'],
  ['é', '\r\n', ''],
];

test('parses quoted commas, escaped quotes and embedded newlines', async () => {
  assert.deepEqual(await collect(parseCsv([SAMPLE])), EXPECTED);
});

test('gives the same rows wherever the input is split into chunks', async () => {
  for (let i = 1; i < SAMPLE.length; i++) {
    for (const j of [i + 1, i + 2]) {
      const chunks = [SAMPLE.slice(0, i), SAMPLE.slice(i, j), SAMPLE.slice(j)];
      assert.deepEqual(await collect(parseCsv(chunks)), EXPECTED, `split at ${i} and ${j}`);
    }
  }
});

test('records skip blank lines and reject a column the file does not have', async () => {
  const [get] = await collect(records(['name,city\n\nAda,Ottawa\n']));
  assert.equal(get('city'), 'Ottawa');
  assert.throws(() => get('province'), /no "province" column/);
});
