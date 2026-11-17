import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { isNonPublicAddress } from '../server/download.js';
import { serve } from '../server/mcp.js';
import { InputError } from '../server/search.js';
import { cleanText, multi, trim } from '../server/text.js';
import { validate } from '../server/validate.js';

const SCHEMA = {
  required: ['id'],
  properties: {
    id: { type: 'string', maxLength: 10 },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
  },
};

test('arguments named after Object.prototype members cannot bypass validation', () => {
  // JSON.parse makes "__proto__" an own property, as a client's message would.
  const smuggled = JSON.parse('{"__proto__": {"id": "x", "limit": 1000000}}');
  assert.throws(() => validate(SCHEMA, smuggled), InputError);
  for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
    assert.throws(() => validate(SCHEMA, { id: 'x', [name]: 1 }), /Unknown argument/, name);
  }
  const ok = validate(SCHEMA, { id: 'x' });
  assert.deepEqual({ ...ok }, { id: 'x', limit: 10 });
});

test('invisible and direction-changing characters are removed from notice text', () => {
  const hidden = 'Snow\u200b re\u202emoval\u{e0041}\u{e0042} &#x202E;&#8203;&#1;services\u0007';
  assert.equal(trim(hidden), 'Snow removal services');
  assert.equal(multi(`*${hidden}\n*B`), 'Snow removal services\nB');
  assert.equal(cleanText(`Line one\r\n\tLine\u2066 two\ufeff`), 'Line one\nLine two');
  assert.equal(trim('Réparations — été'), 'Réparations — été');
});

test('issuer certificates are never fetched from inside the machine or local network', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
    assert.equal(isNonPublicAddress(address, 4), true, address);
  }
  for (const address of ['::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
    assert.equal(isNonPublicAddress(address, 6), true, address);
  }
  assert.equal(isNonPublicAddress('104.18.38.233', 4), false);
  assert.equal(isNonPublicAddress('2606:4700::6812:26e9', 6), false);
});

test('malformed JSON-RPC input gets an error or is ignored, and the server keeps answering', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let out = '';
  output.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
  const done = serve({ info: { name: 't', title: 't', version: '0' }, instructions: '', tools: [], prompts: [] }, input, output);
  input.end(
    ['null', '42', '"text"', '[]', '{not json', '{"jsonrpc":"2.0","id":1,"method":"constructor"}', '{"jsonrpc":"2.0","id":2,"method":"ping"}']
      .join('\n') + '\n',
  );
  await done;
  await new Promise((resolve) => output.end(resolve));
  const replies = out.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(replies.map((r) => [r.id, r.error?.code ?? 'ok']), [[null, -32700], [1, -32601], [2, 'ok']]);
});
