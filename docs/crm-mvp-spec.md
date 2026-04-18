# Clean-room CRM MVP Spec (inspired-by, no code copying)

This document defines an **agentic CRM MVP** that is *inspired by* modern CRMs but implemented from scratch.

## Non-goals
- No feature parity with Twenty or any other CRM
- No code or asset copying from third-party repos

## Core entities
- **Account**: id, name, domain, tier, metadata
- **Contact**: id, accountId, name, email, role, metadata
- **Lead**: id, accountId?, contactId?, source, status, notes
- **Opportunity**: id, accountId, stage, amount?, nextStep
- **Activity**: id, type, subject, createdAt, relatedEntity

## MVP workflows
1) **Lead created** (CRM)
2) Harness ingests event (`lead.created`) and creates:
   - trace
   - research artifact (enrichment)
   - draft outreach artifact
3) Policy gate triggers approval for sending message
4) Approval decision (CLI/Discord)
5) Outcome logged back to CRM as Activity

## Integration boundary (harness ↔ CRM)

### Events from CRM → harness
- `lead.created` { leadId, accountId?, contactId?, payload }

### Calls from harness → CRM
- Create Activity (draft sent / approval denied)
- Update Lead status

### Offline-first
- For CI/demo, provide a **mock CRM adapter** that emits `lead.created` events and records Activities in local storage.
