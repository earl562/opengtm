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

The remaining GTM workflow catalog stays **reference-only** by default until it is backed by the same runtime/recovery substrate.

## Catalog

```bash
opengtm workflow
```

Current reference workflows:
- `crm.roundtrip` (**live**, canonical)
- `sdr.inbound_triage`
- `sdr.lead_research` (**live**)
- `sdr.outreach_compose` (**live**)
- `sdr.outreach_sequence`
- `ae.account_brief`
- `ae.deal_risk_scan`
- `ae.expansion_signal`
- `cs.renewal_prep`
- `cs.health_score`
- `de.usage_analytics`

`crm.roundtrip` is the current claim-bearing path. `sdr.lead_research` and `sdr.outreach_compose` are now live secondary workflows on the same local CRM substrate. The remaining workflows currently render as `reference-only` catalog entries. They are still useful for scaffolding, traces, docs, and fixtures, but they are not yet the claim-bearing public runtime path.

## Run a workflow

```bash
opengtm run workflow sdr.lead_research "research Acme expansion"
opengtm run workflow sdr.outreach_compose "draft first touch for Acme"
opengtm run workflow crm.roundtrip "Pat Example"
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
