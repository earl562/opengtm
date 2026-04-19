# Evals and Debugging

OpenGTM exposes public eval and debugging surfaces for the harness itself.

## Eval suites

```bash
opengtm evals run smoke
opengtm evals run runtime
opengtm evals run ablations
opengtm evals run canonical
opengtm evals run longitudinal
```

## Trace debugging

```bash
opengtm traces list
opengtm traces show <trace-id>
opengtm traces replay <trace-id>
```

## Feedback ledger

```bash
opengtm feedback list
opengtm feedback record revise <trace-id> --message="Tighten the summary"
```

Approval decisions also generate linked feedback records automatically.

## Release validation

```bash
npm run pack:check
npm run smoke:install:cli
```

## What to inspect
- loop failures: provider, parser, connector, runtime
- approval counts and policy decisions
- omitted context sections under budget pressure
- workflow/persona/fixture metadata on traces
- replay behavior for workflow-backed traces
- canonical score thresholds for transferability, maintainability, recovery robustness, context efficiency, and governance quality
- longitudinal stability metrics across repeated canonical runs
