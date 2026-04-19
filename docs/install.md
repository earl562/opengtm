# Install

## Requirements
- Node.js `>= 22`
- npm `>= 11`

## CLI install

From npm once the packages are published:

```bash
npm install -g @opengtm/cli
opengtm help
```

For local contributor installs from this repo:

```bash
npm ci
npm run build
node packages/cli/bin/opengtm.js help
```

## Release validation

These commands now validate the public package surface before release:

```bash
npm run typecheck
npm test
npm run build
npm run audit:contradictions
npm run pack:check
npm run smoke:install:cli
```

## First-run bootstrap

```bash
opengtm init --name="My Workspace"
opengtm workflow
opengtm run workflow crm.roundtrip "Pat Example"
opengtm evals run canonical
```
