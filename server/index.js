#!/usr/bin/env node
// Entry point: `node server/index.js` speaks MCP on stdin/stdout.

// Probe before loading anything else so an unsuitable Node gets one clear
// message. Node 22.16+ and 24+ bundle SQLite with full-text search; older
// releases and the 23.x line do not.
try {
  const { DatabaseSync } = await import('node:sqlite');
  const probe = new DatabaseSync(':memory:');
  probe.exec('CREATE VIRTUAL TABLE probe USING fts5(text)');
  probe.close();
} catch {
  console.error(`northbid needs Node.js 22.16 or newer (24 or newer recommended); this is ${process.version}.`);
  process.exit(1);
}

const { readFileSync } = await import('node:fs');
const { serve } = await import('./mcp.js');
const { defaultDataDir, Store } = await import('./store.js');
const { createTools, INSTRUCTIONS, PROMPTS } = await import('./tools.js');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const store = new Store(defaultDataDir(), {
  offline: process.env.NORTHBID_OFFLINE === '1',
  // The CanadaBuys firewall rejects Node's default agent and any agent containing a URL.
  userAgent: `northbid/${pkg.version}`,
});

await serve({
  info: { name: 'northbid', title: 'Northbid: Canadian procurement search', version: pkg.version },
  instructions: INSTRUCTIONS,
  tools: createTools(store),
  prompts: PROMPTS,
});
store.close();
