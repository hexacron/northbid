# Changelog

## 0.2.0

- Award notices published on CanadaBuys since August 2022: who won, from which buyer, when and for how much. New tools `search_awards`, `get_award` and `summarize_awards`. The five yearly files, about 110 MB, are downloaded the first time an award tool is used.
- The local database is rebuilt on first start after upgrading.
- `server.json` for the MCP registry.

## 0.1.0

First version.

- Local MCP server with no dependencies, for Node.js 22.16 or newer.
- Open and new federal tender notices and active standing offers and supply arrangements from CanadaBuys, cached in SQLite and refreshed with conditional requests.
- Tools: `search_tenders`, `get_tender`, `search_standing_offers`, `data_status`, `refresh_data`.
- Bilingual, accent-insensitive full-text search; output in English or French.
- Claude plugin manifest and `find-opportunities` skill, Gemini CLI extension manifest, Codex configuration.
