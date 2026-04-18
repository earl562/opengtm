# OpenGTM

OpenGTM is an externalization-driven **agentic harness** for **GTM engineers** and **product engineers**.

## Goals
- Artifact-canonical truth (durable artifacts, not provider chat state)
- Provenance-preserving memory
- Lane-aware policy + approvals
- Connector-family contracts (not a flat tool pool)

## Quickstart (dev)
```bash
npm ci
npm -w @opengtm/cli run build
npm run typecheck
npm test
```

## Demo
See `docs/demo.md`.

## CLI
This repository will publish an npm CLI named **`opengtm`**.

> Note: there is an unrelated Python project also branded "OpenGTM". This repo is a Node/TypeScript harness and is not affiliated.

## Community
- Questions: GitHub Discussions
- Security: see `SECURITY.md`
