# Privacy

Northbid runs entirely on your computer. It has no server of its own, no accounts and no telemetry.

## What leaves your computer

Only requests to download public data files:

| Destination | Why |
|---|---|
| `canadabuys.canada.ca` | Open and new tender notice files |
| `sosa.canadabuys.canada.ca` | Standing offers and supply arrangements file |
| The issuer address named in a server certificate (currently `crt.sectigo.com`) | Fetches a missing intermediate certificate when a host above serves an incomplete chain |

Each request carries your IP address, as any web request does, and the user agent `northbid/<version>`. No search terms, conversation content, file contents or identifiers are sent. Set `NORTHBID_OFFLINE=1` to stop all network access.

## What is stored

One SQLite database holding a copy of the downloaded public data, plus the time and version marker of each download. It lives in the plugin data directory under Claude Code, or otherwise in your operating system's cache directory (`NORTHBID_DATA_DIR` overrides this). Nothing about you or your searches is written to it. Delete the file at any time.

## Personal information in the data

The government data files include the names, work emails and work phone numbers of procurement contacts, published by the Government of Canada for bidders to use. Northbid stores and displays these as published and does not combine them with other data.

## Contact

Questions or concerns: [open an issue](https://github.com/hexacron/northbid/issues).
