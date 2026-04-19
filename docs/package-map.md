# Package Map

OpenGTM ships as a public monorepo with `@opengtm/cli` as the primary entrypoint.

## Public packages
- `@opengtm/cli`: operator CLI and public reference workflows
- `@opengtm/types`: shared GTM and harness types/constants
- `@opengtm/core`: entity factories and state transitions
- `@opengtm/storage`: sqlite-backed local runtime storage
- `@opengtm/loop`: governed loop runtime
- `@opengtm/evals`: smoke harness and ablation suites
- `@opengtm/connectors`: connector contracts and reference adapters
- `@opengtm/gateways`: gateway contracts and mocks
- `@opengtm/gateway-discord`: Discord gateway implementation
- `@opengtm/memory`: memory manager, working context, and context budget logic
- `@opengtm/observability`: JSONL run logs and redaction helpers
- `@opengtm/policy`: approvals and risk decisions
- `@opengtm/protocol`: typed protocol envelopes for user/tool/subagent/gateway flows
- `@opengtm/providers`: provider interfaces plus mock/OpenAI-compatible adapters
- `@opengtm/skills`: reference GTM skill manifests and registry logic
- `@opengtm/executors`: lane execution blueprints
- `@opengtm/daemon`: local runtime composition

## Public entrypoints
- CLI: `opengtm`
- Workflow catalog: `opengtm workflow`
- Workflow execution: `opengtm run workflow <workflow-id>`
- Trace inspection: `opengtm traces list|show|replay|rerun`
- Eval suites: `opengtm evals run <suite>`
- Feedback ledger: `opengtm feedback list`

## Current support posture
- OpenGTM is a **public monorepo**.
- The current claim-bearing north-star scenario is `crm.roundtrip`.
- `crm.roundtrip` is the current `live` canonical workflow.
- `sdr.lead_research` and `sdr.outreach_compose` are also `live` on the same local CRM substrate.
- The remaining GTM workflow catalog is currently **reference-only** until the canonical CRM roundtrip substrate is reused there end to end.

## Packaging notes
- Public workspace packages publish with explicit metadata and tarball checks.
- The root repository coordinates workspace builds, tests, release checks, and contradiction audits for the public package set.
