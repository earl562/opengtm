## 2026-04-18 Wave 0-2
- Root `packages/*` is canonical; the duplicate `OpenGTM/` tree was deleted.
- Externalization paper sequencing is the working architecture: provider boundary -> memory -> skills -> protocols -> harness runtime.
- Wave 1 is intentionally vendor-neutral: ship a single OpenAI-compatible fetch provider, not OpenRouter/OpenAI failover inside product code.
- Wave 2 introduced `@opengtm/memory` with working context, context budget, memory manager, and file workspace.
- Existing package patterns favor small ESM modules with index-barrel exports and Vitest tests per package.
- Wave 3 verification confirmed `@opengtm/skills` works with progressive disclosure, registry matching, executor binding, and a valid 18-skill GTM catalog under Vitest coverage.
- Wave 4.2 protocol work kept `packages/protocol` small-module oriented by splitting gateway, tool-call, subagent, user, connector, trace, and common envelope schemas behind the existing `schemas.ts` barrel.
- The richer protocol envelopes now externalize discovery metadata, lifecycle state, and permission/trust boundary fields while preserving the existing gateway event validator contract.
- Wave 4.3 established canonical GTM connector families as `crm`, `enrichment`, `web_research`, `meeting_intelligence`, `warehouse`, `email`, `calendar`, `comms`, `support`, and `docs`; legacy names are now normalized instead of stored directly.
- The connectors mock bundle is more useful when built from family descriptors rather than generic placeholders because it keeps offline execution deterministic while still exposing GTM-oriented capability contracts.
- `executeConnectorAction()` must always route through alias-aware bundle lookup; bypassing `findConnectorContract()` for provider-less execution silently breaks legacy family normalization in the main runtime path.
- Wave 4.4's first real connector path ships best as an additive adapter export: keep the existing contract bundle/simulated execution flow intact, then expose a concrete `opengtm-crm` fetch client plus a real CRM contract in the default bundle.
- `opengtm-crm` Vitest sqlite resolution is fixed by mirroring the storage package pattern: runtime `createRequire(import.meta.url)` for `node:sqlite`, while keeping the sqlite type import type-only.
- Wave 5.2 loop integration can stay provider-minimal by enriching only the prompt surface: inject working context, retrieved memory, disclosed skills, and connector guidance before `generate()`, then parse optional connector-action JSON from the act-phase response.
- The existing context-budget utility is sufficient for first-pass loop governance when prompt sections are prioritized and optional sections are omitted before provider calls; step metadata should retain omitted-section and budget-state details for testability.
- Wave 5.3 can stay additive by introducing optional `runtime.policy` and `runtime.observability` hooks in `@opengtm/loop`; existing provider/memory/skills/connector behavior remains intact when they are omitted.
- Safe connector reads should still auto-execute under policy, while write/external actions (`write-repo`, `mutate-connector`, `send-message`, `browser-act`) should yield a policy decision plus pending approval request and skip connector execution.
- The existing JSONL logger shape is enough for loop tracing when the runtime emits structured `run.*`, `step.*`, `connector.*`, `policy.decision`, and `approval.requested` events.
- Wave 5.4 eval coverage is much more meaningful when the eval package owns a tiny integrated runtime harness that seeds working context, memory, skills, connectors, policy, and context budget directly around `runGovernedLoop()` instead of faking downstream metrics.
- `runAblationSuite()` can exercise real runtime governance deterministically by wiring a fallback act-phase connector action through the connector parser; this keeps memory/skills/policy toggles observable even with a plain mock provider.
- StrykerJS v9 mutation runs need `@stryker-mutator/vitest-runner` plus `testRunner: "vitest"` and the current schema path `@stryker-mutator/core/schema/stryker-schema.json`.
- The CLI parser is intentionally shallow: first token is `command`, second token is `subcommand`, so a cheap top-level `opengtm` alias can route in the router without changing parse behavior.
- The integrated runtime smoke harness already exposes stable signals for CLI summaries via per-step `connectorStatus`, top-level `approvalRequests`, and `omittedPromptSections`.
- Letta separates durable memory state into typed `Block`/`Identity`/`Passage`/`Message`/`Run` entities, then layers managers over them; this strengthens the case for OpenGTM keeping rep memory, account memory, workflow state, and execution traces as separate first-class stores rather than a single generic memory bucket.
- Letta’s git-backed memory path (`services/block_manager_git.py` + `services/memory_repo/*`) is notable because editable core memory can be projected into a filesystem-like contract while Postgres remains a fast cache; OpenGTM can borrow this for human-reviewable GTM account/rep dossiers and workflow scratchpads.
- Letta’s identity model links external identities to both agents and blocks (`orm/identity.py`, `services/identity_manager.py`), which is a strong pattern for OpenGTM account/contact memory: external CRM identifiers should be durable keys that attach to memory artifacts, not just transient prompt fields.

## 2026-04-19 Remote repo study: langchain-ai/async-deep-agents
- `langchain-ai/async-deep-agents` is a thin reference harness, not a full runtime: most durable async job semantics live in Deep Agents middleware and LangGraph platform threads/runs, while this repo mainly wires supervisor/subagent graphs plus optional completion notification middleware.
- The most reusable harness idea for OpenGTM is separating orchestration state from conversational history: job metadata belongs in a durable non-message state channel so approval waits, lead-research jobs, and outreach drafting runs survive summarization/compaction.
- Their async lifecycle stays simple and operator-friendly because job identity is a stable thread ID, while updates interrupt the current run on the same thread; that maps well to resumable GTM work where a rep changes ICP, region, or messaging mid-flight without losing prior context.
- Completion push is intentionally BYO middleware on the worker side, which is a useful OpenGTM pattern: approval gates and long-running connector workflows should support pull-based status by default and optional push notifications when deployment topology allows it.
- The repo has no local tests and only placeholder tools inside worker graphs, so the key lesson is architectural shape rather than implementation depth; OpenGTM should borrow the state/job model and notification boundary, but keep real connector execution, policy, and eval coverage in-repo.

## 2026-04-19 Remote repo study: microsoft/autogen
- AutoGen’s cleanest reusable pattern for OpenGTM is the split between `autogen-core` runtime contracts (`send_message`, `publish_message`, subscriptions, save/load state), `autogen-agentchat` opinionated teams/agents, and `autogen-ext` provider/workbench integrations; OpenGTM should preserve the same separation between harness kernel, GTM workflow layer, and connector/provider adapters.
- `SingleThreadedAgentRuntime` shows a useful boundary: direct RPC, pub/sub fanout, intervention hooks, serializer registry, and per-agent state persistence all live below agent logic; OpenGTM should keep approvals/policy/trace interception at runtime level rather than baking them into SDR/AE/CS agents.
- `SelectorGroupChat` and `MagenticOneOrchestrator` reinforce that orchestration state should be explicit and serializable (`previous_speaker`, message thread, facts, plan, stall counters), not implicit in model context; this maps well to durable GTM campaign/workflow ledgers.
- The MCP workbench pattern is especially relevant: tools are exposed through a workbench boundary that can list dynamic capabilities, execute calls, rename tools via overrides, and optionally expose resources/prompts; OpenGTM connector families can use the same workbench contract for CRM, enrichment, docs, and meeting intelligence surfaces.
- The cross-runtime proto surface (`protos/agent_worker.proto` + CloudEvents) suggests OpenGTM should standardize envelopes early if it wants subagents/workers across runtimes or deployment boundaries; durable `agent_id`, topic subscriptions, RPC IDs, and serialized payload metadata matter more than chat transcripts.

## 2026-04-19 CLI UX wave
- The cleanest upgrade path for OpenGTM CLI UX is additive: keep handlers returning structured objects, then layer a renderer switch in `src/index.ts` so human summaries become default while `--json` preserves exact machine-readable escape hatches.
- The shallow parser can still support global output flags cleanly if it treats the first two non-flag tokens as `command` + `subcommand`; this allows `--json` before or after the command without changing router semantics.
- GTM-operator summaries feel most useful when they foreground lane, workflow state, approvals, trace/log refs, artifact/memory side effects, and explicit next actions instead of dumping the raw storage payload first.

## 2026-04-19 Approval continuation path
- Minimal approval resume semantics can stay storage-only for now: approving should move the approval request to `approved`, the linked build work item to `queued`, and the linked trace/awaiting step to `queued` so operators have an explicit continuation signal without implementing the async runner yet.
- Denial is most coherent as a terminal stop: move the approval request to `denied`, cancel the linked work item, cancel the linked trace step, and stamp `endedAt` on the trace so the CLI clearly communicates non-continuation.
- The existing shallow CLI parser is sufficient for `approvals approve <id>` and `approvals deny <id>` as long as the router forwards `subcommand` plus the first positional argument into the approvals handler.

## 2026-04-19 Build approval continuation
- The narrowest viable resume path is to persist the existing queued approval transition first, then immediately run an inline build-lane continuation that moves work item state queued -> running -> completed, updates trace phases through validate/handoff, and appends to the existing trace log.
- For operator visibility, returning artifact id/path from approvals approve and rendering those references in the approvals summary makes the continuation observable without changing --json payload shape for unrelated commands.

## 2026-04-19 Skills content externalization
- `@opengtm/skills` can externalize GTM skill prose cleanly by keeping manifests authoritative in `catalog.ts` and resolving `contentPath` with `fileURLToPath(new URL('../content/<id>.md', import.meta.url))`.
- `registry-v2` full disclosure already honors loaded markdown verbatim once `artifact.contentPath` is populated, so the missing step was catalog wiring plus real content files rather than registry changes.
- In this repo's source-first package layout, targeted Vitest execution is the most reliable manual smoke path for direct `src/*.ts` imports because the package source uses ESM `.js` specifiers before a build step.

## 2026-04-19 GTM entity memory
- The existing `MemoryManager` already has the right extension seam for GTM-native memory: a thin wrapper that canonicalizes `scope` strings keeps storage/schema unchanged while adding first-class rep/account/stakeholder/opportunity semantics.
- Canonical scopes like `rep:<id>` and `account:<id>` fit the current exact-match storage query path cleanly, so entity isolation can be enforced without widening `queryMemoryRecords()`.
- Relation metadata works well as additive retrieval hints (`entity:*`, `entity-id:*`, `relation:*`) because it preserves generic search compatibility while tagging GTM context for future ranking or cross-entity helpers.

## 2026-04-19 Autonomy and CI/CD
- Autonomy works best as an explicit mode system, not a boolean: `off`, `safe`, `dry-run`, `background`, and `full` give the operator a clear contract for how much automation and risk is allowed.
- The current OpenGTM build lane can support `full` and `dry-run` autonomy without a separate worker by auto-approving internally and reusing the existing continuation path; `background` should queue work and stop, not pretend to execute asynchronously.
- Making bare `opengtm` the default command is just a parser default plus the existing top-level alias path; no binary/package rename is needed because the published bin was already correct.
- Production-grade GitHub Actions for this repo should validate both the root workspace surface and `opengtm-crm`, keep mutation in a dedicated workflow, and add static analysis/security scanning without overloading normal PR CI.
