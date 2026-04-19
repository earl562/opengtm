# Release

We use **Changesets**.

## Add a changeset
```bash
npm run changeset
```

## CI
The Release workflow validates the public package surface, creates a version PR, and can publish public packages when `NPM_TOKEN` is configured.

## Public release checks
```bash
npm run typecheck
npm test
npm run build
npm run audit:contradictions
npm run build && node packages/cli/bin/opengtm.js evals run canonical
npm run report:canonical:ci
npm run test:e2e:canonical
npm run pack:check
npm run smoke:install:cli
```

## CI artifacts
CI and Release now upload:
- `reports/ci/canonical-eval.json`
- `reports/ci/canonical-eval.md`
- `reports/ci/longitudinal-eval.json`
- `reports/ci/longitudinal-eval.md`
- `reports/ci/canonical-debug-bundle.json`
- `reports/ci/canonical-debug-bundle.md`
