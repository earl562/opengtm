# OpenGTM

OpenGTM is an externalization-driven **agentic harness** for **GTM engineers** and **product engineers**.

## Goals
- Artifact-canonical truth (durable artifacts, not provider chat state)
- Provenance-preserving memory
- Lane-aware policy + approvals
- Connector-family contracts (not a flat tool pool)

## Quickstart (dev)
```bash
# Clone + enter the repo (prevents "No workspaces found" errors)
git clone https://github.com/earl562/opengtm opengtm
cd opengtm

npm ci
npm -w @opengtm/cli run build

# Sanity check: ensure you're running the OpenGTM CLI from this repo
node packages/cli/bin/opengtm.js --help

npm run typecheck
npm test
```

## Troubleshooting
- `npm error No workspaces found: --workspace=@opengtm/cli`
  Cause: you are not in the OpenGTM repo root. Fix: `cd opengtm` (the folder containing `package.json` with `"workspaces": ["packages/*", "test"]`).
- `ExperimentalWarning: SQLite is an experimental feature`
  This comes from Node's `node:sqlite` and is non-fatal; tests/builds should still pass.

## Demo
See `docs/demo.md`.

## Docs
- Install: `docs/install.md`
- Architecture: `docs/architecture.md`
- Package map: `docs/package-map.md`
- Workflows: `docs/workflows.md`
- Connectors: `docs/connectors.md`
- Evals & debugging: `docs/evals.md`
- Security: `docs/security.md`
- Discord: `docs/discord.md`
- Release: `docs/release.md`
- CRM MVP spec (clean-room): `docs/crm-mvp-spec.md`

## CRM (separate repo)
- The clean-room CRM app will live in `earl562/opengtm-crm` (will be created later); OpenGTM remains the harness repo.

## CLI
This repository will publish an npm CLI named **`opengtm`**.

## Current OSS truthfulness contract
- Canonical claim-bearing scenario: `crm.roundtrip`
- Canonical workflow: `opengtm run workflow crm.roundtrip "Pat Example"` (**live**, local-first)
- Additional live workflows on the same substrate: `sdr.lead_research`, `sdr.outreach_compose`
- Remaining workflow catalog: currently **reference-only** until the CRM roundtrip substrate is reused there
- Release contradiction audit: `npm run audit:contradictions`

> Note: there is an unrelated Python project also branded "OpenGTM". This repo is a Node/TypeScript harness and is not affiliated.

## Community
- Questions: GitHub Discussions
- Security: see `SECURITY.md`
