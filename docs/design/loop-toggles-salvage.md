# Design Note: Governed-Loop Toggle Design (Salvaged from OpenGTM/ fork)

**Date salvaged:** 2026-04-18
**Source:** `OpenGTM/packages/loop/src/index.ts` (now deleted)
**Status:** Design reference. Informs Wave 2 (externalization core) of the harness scaffold plan.

## Why this is preserved

During Wave 0 reconciliation of the divergent `OpenGTM/` duplicate tree, most files in the fork were older or strictly inferior to their root equivalents. **One exception** was the governed-loop implementation at `OpenGTM/packages/loop/src/index.ts`, which encoded a different design direction worth preserving even though the root tree was taken as canonical for production continuation.

The fork's loop introduced **harness-subsystem toggles**: runtime flags for `memoryRetrieval`, `skillLoading`, and `policyGating` that the loop exposes as first-class inputs. The result shape then reports `goalSatisfied`, `errorCount`, `approvalsRequested`, and `approvalsGranted` so evals (specifically the ablation suite in `@opengtm/evals`) can attribute outcome deltas back to specific harness subsystems.

This is exactly the **"externalize evaluation"** pattern called for by the Externalization paper (Zhang et al., arXiv:2604.08224, Section 6): the harness should make its own dimensions measurable, not just its outputs.

## The preserved shape

```ts
export interface OpenGtmGovernedLoopToggleSet {
  memoryRetrieval?: boolean
  skillLoading?: boolean
  policyGating?: boolean
}

export interface OpenGtmGovernedLoopResult {
  goal: string
  status: 'stopped'
  steps: OpenGtmGovernedLoopStep[]
  goalSatisfied: boolean
  errorCount: number
  approvalsRequested: number
  approvalsGranted: number
  toggles: Required<OpenGtmGovernedLoopToggleSet>
}
```

Interaction with `@opengtm/evals` ablation suite used this to produce tables attributing goal-satisfaction deltas to each toggle (e.g. "disabling skillLoading reduces goalSatisfied rate by X").

## What the root tree has instead (and why we didn't simply merge)

Root's `packages/loop/src/index.ts` uses a **phase-cycling** model (`plan | observe | act | reflect`) with **cost/time/step limits**. It uses `provider.generate()` with a richer input/output shape (system, temperature, maxTokens, cost tracking, token accounting). This is production-path-forward because:

1. Cost/time limits are required for any real LLM loop; the fork had neither.
2. `provider.generate()` is a richer surface that the Wave 1 provider work (OpenRouter + OpenAI) can implement directly.
3. Phase semantics align with the Externalization paper's harness control-flow model (`perceive → retrieve → plan → act → observe`).

## Directive for Wave 2

When building the real tool-calling loop in Wave 2, the fork's toggle design **must** be reintroduced as an **optional middleware layer**, not as a replacement for the phase model:

- Keep the phase model (`plan | observe | act | reflect`) as the default loop topology.
- Keep the cost/time/step limit guardrails.
- **Add toggles** as a `HarnessSubsystemToggles` parameter on the loop with the same three flags (`memoryRetrieval`, `skillLoading`, `policyGating`) plus additional flags that become relevant as Wave 2 lands (`filesystemOffload`, `compaction`, `subagents`).
- **Add to the result shape** the counters the ablation suite depends on: `goalSatisfied`, `errorCount`, `approvalsRequested`, `approvalsGranted`, `toggles`.
- Restore the ablation suite's ability to sweep toggle combinations and emit attribution tables.

This keeps Wave 2 building on the root's richer control-flow while recovering the fork's evals-attribution capability.

## Removed files catalog

Fork packages deleted entirely (all strictly subsumed by root):
- `OpenGTM/packages/{cli,connectors,core,daemon,evals,executors,loop,policy,providers,skills,storage,types}/**`
- `OpenGTM/LICENSE`, `OpenGTM/RALPH.md`, `OpenGTM/package.json`, `OpenGTM/package-lock.json`
- `OpenGTM/stryker.conf.json`, `OpenGTM/tsconfig.json`, `OpenGTM/vitest.config.ts`, `OpenGTM/test/`

No files from the fork were unique to it except the toggle-loop shape captured above.
