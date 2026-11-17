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

1. Raise the version in `package.json`, `server.json` (both `version` fields), `.claude-plugin/plugin.json` and `gemini-extension.json` together, and add an entry to [CHANGELOG.md](CHANGELOG.md). `npm test` fails if they disagree.
2. Merge to `main` and wait for CI to pass.
3. Tag the commit and push the tag: `git tag v0.3.0 && git push origin v0.3.0`. Tags cannot be moved or deleted afterwards.
4. The [release workflow](.github/workflows/release.yml) runs CI again and stages the package on npm. Nothing is public yet.
5. Review and approve the staged package on npmjs.com, under **Staged Packages**, with two-factor authentication.
6. Approve the `release` environment on the workflow run. It publishes `server.json` to the MCP registry and creates the GitHub release from the changelog entry.

Nothing is published from a laptop and no publishing token is stored anywhere. The one-time setup behind this:

- On npmjs.com, the package's **Trusted Publisher** is GitHub Actions, repository `hexacron/northbid`, workflow `release.yml`, no environment, allowed action `npm stage publish` only. **Publishing access** is set to require two-factor authentication and disallow tokens.
- On GitHub, the `release` environment requires a reviewer and accepts only `v*` tags.

## Continuous integration

Every push and pull request runs [CI](.github/workflows/ci.yml): the tests on Linux, macOS and Windows with Node 22.16.0, 22 and 24, then a packaging job that fails if `package.json` gains a dependency or an install script, checks what is in the npm tarball, and starts the installed package. Actions are pinned to commits and updated by Dependabot. Security practices are in [SECURITY.md](SECURITY.md).

## Reporting data problems

If a result disagrees with the CanadaBuys website, include the reference number and the output of `data_status` in the issue. Problems in the source data itself should also go to [CanadaBuys support](https://canadabuys.canada.ca/en/support).
