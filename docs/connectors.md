# Connector Authoring

Connectors are grouped by GTM-relevant families instead of being exposed as a flat tool pool.

## Built-in reference families
- `crm`
- `enrichment`
- `web_research`
- `meeting_intelligence`
- `warehouse`
- `email`
- `calendar`
- `comms`
- `support`
- `docs`

## Contract requirements
Every connector family should define:
- provider id
- family id
- capabilities
- read actions
- write actions
- approval expectations
- trace requirement
- auth/session expectations

See:
- [packages/connectors/src/contract.ts](/Users/earlperry/Desktop/Projects/opengtm/packages/connectors/src/contract.ts)
- [packages/connectors/src/bundle.ts](/Users/earlperry/Desktop/Projects/opengtm/packages/connectors/src/bundle.ts)
- [packages/connectors/src/opengtm-crm.ts](/Users/earlperry/Desktop/Projects/opengtm/packages/connectors/src/opengtm-crm.ts)

## Local inspection

```bash
opengtm connector list
```

## Release expectation
- Public connectors must pass tarball checks.
- Approval-gated connectors must preserve traceability and policy metadata.
- Gateway or workflow-facing connectors should ship with mocks or fixtures for repeatable local verification.
