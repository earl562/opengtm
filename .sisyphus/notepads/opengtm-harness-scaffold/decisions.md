## 2026-04-18 User decisions
- OpenRouter/OpenAI failover belongs to opencode/session configuration, not to shipping OpenGTM runtime code.
- OpenGTM should ship one reference provider abstraction: an OpenAI-compatible fetch provider with `baseURL + apiKey + model`.
- `opengtm-crm` remains separate and should integrate via typed connector contracts later, not be absorbed into `packages/*`.
- Build order is guided by the Externalization paper: Memory -> Skills -> Protocols -> Harness runtime after the provider boundary.
- Connector-family naming should follow the Wave 3 GTM skills catalog, with alias normalization preserving reasonable legacy inputs like `docs-knowledge`, `browser-automation`, and `email-calendar`.
- The first real CRM connector remains dependency-light and talks to the clean-room service over raw `fetch`; no CRM SDK layer was added.
- `opengtm-crm` server boot now supports exported start/stop helpers so connector integration tests can exercise a live in-process server without module-import side effects.
- Wave 5.3 loop governance is runtime-data-only: approval gating records policy/approval metadata on loop steps/results and emits observability events, but does not add any approval UI or protocol changes.

## 2026-04-19 GTM entity memory
- GTM-native memory should stay additive inside `@opengtm/memory`: wrap the generic `MemoryManager` with entity-aware APIs instead of widening storage tables or introducing a second memory architecture.
- The first-class entity set for this layer is `rep`, `account`, `stakeholder`, and `opportunity`, with canonical scopes encoded as `<kind>:<id>`.
