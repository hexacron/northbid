# Records assets/demo.gif: a real Claude Code session using Northbid.
#
#   brew install vhs
#   vhs assets/demo.tape        (from the repository root)
#
# Before recording:
# - Claude Code is installed and signed in.
# - The cache is loaded: run one award search first, so the recording does not
#   sit through the first download.
# - Run `claude` once in /tmp/northbid-demo/work and accept the workspace trust
#   prompt, so it does not appear in the recording.

Output assets/demo.gif

Set Shell bash
Set FontSize 17
Set Width 1200
Set Height 840
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set WaitTimeout 120s

Hide
Type `REPO=$PWD; mkdir -p /tmp/northbid-demo/work && cd /tmp/northbid-demo/work`
Enter
Type `claude() { command claude --strict-mcp-config --mcp-config "{\"mcpServers\":{\"northbid\":{\"command\":\"node\",\"args\":[\"$REPO/server/index.js\"]}}}" --allowedTools mcp__northbid "$@"; }; clear`
Enter
Sleep 1s
Show

Type "claude"
Sleep 500ms
Enter
Wait+Screen /shift\+tab to cycle/
Sleep 1500ms

Type "Which suppliers won the most federal translation contracts since April 2025? Top five by total value, as a short table."
Sleep 800ms
Enter
Wait+Screen /\ds . done/
Sleep 8s
