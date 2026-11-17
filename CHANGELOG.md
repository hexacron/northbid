# Changelog

## 0.2.1

Security hardening after a review. None of these was known to be exploited.

- An unreadable reply to the certificate-repair request no longer crashes the server, and that request is refused when the address is an IP literal or resolves inside the machine or local network.
- Arguments named `__proto__`, `constructor` and the like are rejected instead of slipping past validation and its limits.
- Malformed JSON-RPC input such as a bare `null` no longer stops the server.
- Invisible, control and direction-changing characters are removed from notice text, and the server instructions tell the model to treat notice text as data. The local database is rebuilt on first start so stored text is cleaned too.
- `bidding_url` is returned only when it is an http or https link.
- Downloads are capped at 256 MB per file; the cache directory is created private to the user; `data_status` no longer reveals the home directory name.
- Continuous integration, a tag-driven release workflow with npm trusted publishing and provenance, and a security policy.

## 0.2.0

- Award notices published on CanadaBuys since August 2022: who won, from which buyer, when and for how much. New tools `search_awards`, `get_award` and `summarize_awards`. The five yearly files, about 110 MB, are downloaded the first time an award tool is used.
- The local database is rebuilt on first start after upgrading.
- `server.json` for the MCP registry.
- French README.

## 0.1.0

First version.

- Local MCP server with no dependencies, for Node.js 22.16 or newer.
- Open and new federal tender notices and active standing offers and supply arrangements from CanadaBuys, cached in SQLite and refreshed with conditional requests.
- Tools: `search_tenders`, `get_tender`, `search_standing_offers`, `data_status`, `refresh_data`.
- Bilingual, accent-insensitive full-text search; output in English or French.
- Claude plugin manifest and `find-opportunities` skill, Gemini CLI extension manifest, Codex configuration.
