# Workflows

OpenGTM now exposes reference GTM workflows as a first-class public surface.

## Support tiers
- `live`: runtime-backed behavior present in this repo and exercised locally
- `simulated`: execution returns deterministic simulated behavior or missing-auth fallbacks
- `contract-only`: contract/schema exists without a runtime-backed execution path
- `reference-only`: useful public scaffolding, but not part of the current claim-bearing OSS slice

## canonical scenario
The current north-star claim surface is **`crm.roundtrip`**:

`lead.created -> research artifact -> draft outreach artifact -> approval decision -> CRM activity/log update`

That canonical slice now runs as a local-first **`live`** path. Two SDR workflows now reuse the same substrate:
- `sdr.lead_research` (**live**)
- `sdr.outreach_compose` (**live**)
Additional account-lifecycle workflows now run on the same local-first runtime substrate:
- `cs.health_score` (**live**)
- `cs.renewal_prep` (**live**)
- `ae.expansion_signal` (**live**)
- `ae.account_brief` (**live**)
- `ae.deal_risk_scan` (**live**)

The remaining GTM workflow catalog stays **reference-only** by default until it is backed by the same runtime/recovery substrate.

## Catalog

```bash
opengtm workflow list
```

Current reference workflows:
- `crm.roundtrip` (**live**, canonical)
- `sdr.inbound_triage`
- `sdr.lead_research` (**live**)
- `sdr.outreach_compose` (**live**)
- `ae.account_brief` (**live**)
- `ae.deal_risk_scan` (**live**)
- `ae.expansion_signal` (**live**)
- `cs.renewal_prep` (**live**)
- `cs.health_score` (**live**)
- `sdr.outreach_sequence`
- `de.usage_analytics`

`crm.roundtrip` is the current claim-bearing path. `sdr.lead_research`, `sdr.outreach_compose`, `cs.health_score`, `cs.renewal_prep`, `ae.expansion_signal`, `ae.account_brief`, and `ae.deal_risk_scan` are now live secondary workflows on the same local-first substrate. The remaining workflows currently render as `reference-only` catalog entries. They are still useful for scaffolding, traces, docs, and fixtures, but they are not yet the claim-bearing public runtime path.

## Run a workflow

```bash
opengtm workflow run sdr.lead_research "research Acme expansion"
opengtm workflow run sdr.outreach_compose "draft first touch for Acme"
opengtm workflow run crm.roundtrip "Pat Example"
```

## Agentic harness run

The agentic GTM harness creates a durable orchestrator job plus bounded stage jobs for preflight safety, research, account intelligence, approval-ready drafting, and feedback learning. It persists the delegation ledger, trace, approval request, and run artifact locally.

```bash
opengtm agent harness run "Research Acme inbound lead and draft safe follow-up"
opengtm agent job list
opengtm approvals list
```

## Workflow behavior
- Research-style workflows complete immediately and emit artifacts plus traces.
- Ops-style workflows can pause in `awaiting-approval` and emit approval records.
- Workflow output should identify whether the surface is `reference-only`, `simulated`, `contract-only`, or `live`.
- Each run stores:
  - `workflowId`
  - `workflowRunId`
  - `persona`
  - `fixtureSetId`
  - linked trace/log references

## Trace debugging

```bash
opengtm traces list
opengtm traces show <trace-id>
opengtm traces replay <trace-id>
opengtm traces rerun <trace-id>
```

- `traces replay` is a deterministic read-only replay of recorded state.
- `traces rerun` re-executes the underlying workflow or lane.
