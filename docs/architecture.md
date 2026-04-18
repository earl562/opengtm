# Architecture

OpenGTM is a harness built around **externalization**:

- **Artifacts** are the canonical truth (not chat transcripts)
- **Memory** is tiered and selectively retrieved
- **Policy** gates risky actions via approvals
- **Connectors** are grouped by families with explicit capability contracts
- **Lanes** (`research`, `build-integrate`, `ops-automate`) own work and exchange durable handoffs

## Core packages
- `@opengtm/types`: domain types/constants
- `@opengtm/core`: entity factories + transitions
- `@opengtm/storage`: sqlite + artifact blobs
- `@opengtm/policy`: risk/approval decisions + config
- `@opengtm/connectors`: connector contracts and execution stubs
- `@opengtm/loop`: governed plan/observe/act/reflect loop with runtime limits
- `@opengtm/gateways`: gateway contracts (Discord + mocks)
