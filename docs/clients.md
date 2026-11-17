# Client setup

Northbid is a stdio MCP server started with `node server/index.js`. Every client needs Node.js 22.16 or newer on its PATH (not 23.x).

| Client | Status |
|---|---|
| Claude Code | Tested: loaded with `--plugin-dir` and searched from a session; manifest passes `claude plugin validate --strict` |
| Cowork (local sessions) | Same plugin; not yet tested |
| Codex CLI, ChatGPT desktop app | Configuration follows the Codex documentation; not yet tested |
| Gemini CLI | Extension manifest follows the Gemini documentation; not yet tested |

If you confirm or fix a setup, please open a pull request updating this table.

## Claude Code and Cowork

From the marketplace in this repository:

```
/plugin marketplace add hexacron/northbid
/plugin install northbid@northbid
```

From a local clone, for one session:

```bash
claude --plugin-dir /absolute/path/to/northbid
```

Run `/mcp` to confirm the `northbid` server is connected. The plugin also provides the `find-opportunities` skill.

Local MCP servers load in Claude Code and in Cowork sessions that run on your computer. They do not load in claude.ai chat, where only the skill is available.

## Codex and the ChatGPT desktop app

Either run:

```bash
codex mcp add northbid -- npx -y northbid
```

or add this to `~/.codex/config.toml`:

```toml
[mcp_servers.northbid]
command = "npx"
args = ["-y", "northbid"]
```

To run from a clone instead, use `node` with `/absolute/path/to/northbid/server/index.js` as the argument.

In the ChatGPT desktop app the same server can be added under **Settings > MCP servers > Add server**, choosing **STDIO**. The app and the Codex CLI share one configuration.

## Gemini CLI

```bash
gemini extensions install https://github.com/hexacron/northbid
```

The repository root is a Gemini extension (`gemini-extension.json`). Gemini also loads the `find-opportunities` skill from `skills/`.

## Other clients

Most clients accept a JSON block like this (Claude Desktop, Cursor, VS Code and others use this shape). With the npm package, nothing needs cloning:

```json
{
  "mcpServers": {
    "northbid": {
      "command": "npx",
      "args": ["-y", "northbid"]
    }
  }
}
```

From a clone:

```json
{
  "mcpServers": {
    "northbid": {
      "command": "node",
      "args": ["/absolute/path/to/northbid/server/index.js"]
    }
  }
}
```

## Without a skill

The skill is a convenience. The server describes itself through its MCP `instructions`, its tool descriptions and a `find_opportunities` prompt, so clients that support none of the skill formats still get the guidance they need.

## Environment variables

| Variable | Effect |
|---|---|
| `NORTHBID_DATA_DIR` | Directory for the SQLite database |
| `NORTHBID_OFFLINE=1` | Never contact the network |

Default database location: the plugin data directory under Claude Code; otherwise `~/Library/Caches/northbid` on macOS, `%LOCALAPPDATA%\northbid` on Windows, and `$XDG_CACHE_HOME/northbid` or `~/.cache/northbid` elsewhere.
