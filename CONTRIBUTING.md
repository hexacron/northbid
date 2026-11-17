# Contributing

## Setup

You need Node.js 22.16 or newer (not 23.x). There is nothing to install.

```bash
git clone https://github.com/hexacron/northbid.git
cd northbid
npm test
```

## Running it

```bash
node server/index.js
```

The server waits for MCP messages on stdin. To try it by hand, paste these two lines:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_tenders","arguments":{"query":"translation OR traduction","limit":3}}}
```

Set `NORTHBID_DATA_DIR` to a scratch directory to keep test data away from your real cache.

To load the plugin into Claude Code from your working copy:

```bash
claude --plugin-dir .
claude plugin validate .
```

## Ground rules

- **No dependencies.** The server must run on Node built-ins alone. This keeps installation trivial and the code reviewable for directory listings.
- **Readable source.** No bundling, minification or generated files. Keep each file under 256 KiB.
- **Tools stay read-only** unless they refresh the cache, and every tool carries complete MCP annotations.
- **Tool descriptions are part of the product.** They are what a model reads. When behaviour changes, change the description and [docs/tools.md](docs/tools.md) with it.
- **Be frugal with output.** Search results are summaries; detail belongs in `get_tender`.
- **Schema changes** need a `SCHEMA_VERSION` bump in `server/store.js` and an update to [docs/data.md](docs/data.md).
- **Two READMEs.** A change to `README.md` needs the same change in `README.fr.md`. The other documents are English only.

## Releasing

Raise the version in `package.json`, `server.json` (both `version` fields), `.claude-plugin/plugin.json` and `gemini-extension.json` together, and add an entry to [CHANGELOG.md](CHANGELOG.md).

## Reporting data problems

If a result disagrees with the CanadaBuys website, include the reference number and the output of `data_status` in the issue. Problems in the source data itself should also go to [CanadaBuys support](https://canadabuys.canada.ca/en/support).
