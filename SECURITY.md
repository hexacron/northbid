# Security

## Reporting a vulnerability

Please report privately through [GitHub's vulnerability reporting form](https://github.com/hexacron/northbid/security/advisories/new), not in a public issue. Include the version, what an attacker controls, and what they gain. You should get a reply within a week.

Only the latest release is supported; fixes ship as a new version.

## What Northbid trusts, and what it does not

Northbid is a local program started by your MCP client. It runs with your user's permissions, listens on no port, and has no account or backend.

| Input | Treated as | Handling |
|---|---|---|
| Tool arguments from the model | Untrusted | Checked against each tool's schema; unknown arguments are rejected. Values reach SQLite only as bound parameters, and search text is tokenized and quoted before it reaches the full-text engine |
| CanadaBuys data files | Untrusted content from a trusted host | Fetched only over verified HTTPS from fixed host names. Parsed as data; never executed or used to build file paths or SQL |
| Text inside notices | Untrusted | Returned to the model as data. A notice can contain text written to look like instructions; the server tells the model that notice text is content, not direction, but your client's own safeguards are what decide |
| Environment variables | Trusted | `NORTHBID_DATA_DIR` chooses where the cache file goes |

Things it never does: run shell commands, write outside its cache directory, read your files, open a listening socket, or send anything but GET requests for the public files listed in [PRIVACY.md](PRIVACY.md).

## Certificate handling

One source host omits its intermediate TLS certificate. Northbid fetches that certificate from the address named in the server's own certificate and accepts it only if it is in date, signed the server's certificate, and is itself signed by a root authority in Node's trust store. The address must be a host name that resolves to a public address. Host name and chain verification are never switched off for a request that carries or receives data. Details are in [docs/architecture.md](docs/architecture.md#downloading).

## Supply chain

- **No dependencies.** The server uses only Node.js built-ins, so there is no dependency tree to compromise and no install script. CI fails if either is added.
- **Releases are built in the open.** A version tag triggers the [release workflow](.github/workflows/release.yml), which publishes to npm through trusted publishing (OIDC, no stored token) with a provenance attestation. A maintainer must approve each staged package with two-factor authentication before it becomes public.
- **Verify a release:** `npm view northbid dist.attestations` shows the provenance, and `npm audit signatures` checks it after install. Version 0.2.0 was published by hand before this pipeline existed and has no attestation.
- **Pin if you prefer.** `npx -y northbid` runs the newest release each time it starts. Use `npx -y northbid@0.2.1` to stay on a version you have reviewed.
- **Workflows** pin every action to a commit, run with read-only permissions unless a job needs more, and are kept current by Dependabot. CodeQL scans the code on every push.
- **Release tags cannot be moved or deleted**, and `main` cannot be force-pushed.
