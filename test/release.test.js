import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const json = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

test('every manifest carries the package version and the registry name', () => {
  const pkg = json('package.json');
  const server = json('server.json');
  assert.deepEqual(
    {
      'server.json': server.version,
      'server.json packages[0]': server.packages[0].version,
      '.claude-plugin/plugin.json': json('.claude-plugin/plugin.json').version,
      'gemini-extension.json': json('gemini-extension.json').version,
    },
    {
      'server.json': pkg.version,
      'server.json packages[0]': pkg.version,
      '.claude-plugin/plugin.json': pkg.version,
      'gemini-extension.json': pkg.version,
    },
  );
  assert.equal(server.name, pkg.mcpName);
  assert.equal(server.packages[0].identifier, pkg.name);
  assert.ok(readFileSync(join(root, 'CHANGELOG.md'), 'utf8').includes(`\n## ${pkg.version}\n`), 'CHANGELOG has no entry');
});

test('the entry point answers MCP requests over stdio without the network', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'northbid-test-'));
  try {
    const child = spawn(process.execPath, [join(root, 'server/index.js')], {
      env: { ...process.env, NORTHBID_DATA_DIR: dir, NORTHBID_OFFLINE: '1' },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const requests = [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { id: 2, method: 'tools/list' },
      { id: 3, method: 'tools/call', params: { name: 'data_status', arguments: {} } },
      { id: 4, method: 'tools/call', params: { name: 'search_tenders', arguments: {} } },
    ];
    child.stdin.end(requests.map((r) => `${JSON.stringify({ jsonrpc: '2.0', ...r })}\n`).join(''));
    let out = '';
    for await (const chunk of child.stdout.setEncoding('utf8')) out += chunk;
    const replies = new Map(out.trim().split('\n').map((line) => JSON.parse(line)).map((m) => [m.id, m.result]));

    assert.equal(replies.get(1).serverInfo.version, json('package.json').version);
    assert.ok(replies.get(2).tools.some((t) => t.name === 'search_awards'));
    assert.equal(JSON.parse(replies.get(3).content[0].text).offline, true);
    // Nothing is cached and the network is off: a clear error, not a crash.
    assert.equal(replies.get(4).isError, true);
    assert.match(replies.get(4).content[0].text, /NORTHBID_OFFLINE/);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
