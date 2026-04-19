# OpenGTM State Report — 2026-04-19

## Outcome
The approved externalization-completion waves are now implemented through a coherent public OSS baseline:

- **Wave 0:** canonical scenario lock + contradiction cleanup
- **Wave 1:** runtime truthfulness contract (`live` / `simulated` / `contract-only` / `reference-only`)
- **Wave 2:** end-to-end canonical CRM roundtrip slice
- **Wave 3:** explicit replay vs rerun semantics plus checkpoint/recovery/provenance signals
- **Wave 4:** canonical paper-aligned evaluation suite with thresholds and expected ablation deltas
- **Wave 5:** OSS posture/docs/CI-CD updates, plus full-app E2E coverage

## Canonical claim-bearing slice
Current north-star public workflow:

`crm.roundtrip`

Flow:
`lead.created -> research artifact -> draft outreach artifact -> approval decision -> CRM activity/log update`

Current posture:
- `crm.roundtrip` = **live** canonical path
- broader GTM workflow catalog = **reference-only** until promoted onto the same runtime/recovery substrate

## What changed
### Runtime/product surface
- Added canonical local CRM fixture support and live canonical roundtrip orchestration.
- Added support-tier metadata to workflow manifests and workflow run results.
- Added truthfulness facts to research/ops traces and artifact provenance.
- Added CRM outcome logging for approve/deny paths.
- Added checkpoint artifact generation and recovery-semantics facts for the canonical slice.
- Split trace semantics into:
  - `traces replay` = deterministic read-only replay
  - `traces rerun` = actual re-execution

### Evaluation/reporting
- Added `opengtm evals run canonical`.
- Canonical eval now scores:
  - transferability
  - maintainability
  - recovery robustness
  - context efficiency
  - governance quality
- Added explicit thresholds and expected ablation deltas.

### OSS/CI/CD/docs
- Added contradiction audit script and regression test.
- Updated CI and release GitHub Actions to run contradiction audit and canonical eval.
- Updated docs/install/demo/package-map/workflows/release/README to reflect the canonical live path and replay/rerun semantics.
- Added full-app E2E test coverage for init -> workflow -> approval -> replay/rerun -> eval.

## Verification evidence
### Core verification
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run audit:contradictions` ✅
- `npm run pack:check` ✅
- `npm run smoke:install:cli` ✅
- `node packages/cli/bin/opengtm.js evals run canonical` ✅

### Full test suite
- `npm test` ✅
- Result: **35 test files passed, 144 tests passed**

### Full-app E2E
- `packages/cli/test/e2e-app.test.ts` ✅
- Covered path:
  - workspace init
  - canonical workflow run
  - approval resolution
  - deterministic replay
  - rerun
  - canonical eval

## Current strengths
- Public claim surface is now narrower and more truthful.
- The harness has one real, local-first, inspectable end-to-end slice.
- Approval/feedback/CRM outcome lineage is test-covered.
- Replay vs rerun semantics are explicit.
- Canonical eval gives a repeatable externalization-focused quality gate.
- GitHub Actions now enforce contradiction audit + canonical eval in CI/release validation.

## Remaining limitations
1. **Canonical depth is real, but catalog breadth is still reference-only.**
   Most workflows remain scaffolding until upgraded to the canonical substrate.
2. **Deterministic replay is state replay, not step-by-step side-effect simulation.**
   It is honest and useful, but still intentionally lightweight.
3. **Recovery semantics are slice-aware but not yet a full transactional rollback engine.**
   The system classifies reversible/resumable/operator-intervention effects; it does not yet provide deep effect-aware rollback for every workflow.
4. **Canonical eval dimensions are explicit and reproducible, but still heuristic.**
   They are a meaningful gate, but later iterations should make them more evidence-rich and less hand-shaped.
5. **The local CRM fixture is strong for OSS/dev/CI, but not yet a production connector runtime.**

## Release-readiness judgment
OpenGTM is now in a materially stronger OSS state:
- one live canonical workflow
- truthfulness contract enforced
- governance and recovery signals present
- CI/CD checks widened
- full-app E2E coverage present

This is a credible baseline for continued hardening, not the end-state of the harness.
