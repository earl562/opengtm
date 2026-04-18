# Contributing

Thanks for contributing to OpenGTM.

## Development Setup
Requirements:
- Node.js >= 20
- npm >= 10

Install dependencies:
```bash
npm ci
```

Run checks:
```bash
npm run typecheck
npm test
```

## Repository Conventions
- Packages live in `packages/*`
- Prefer small, atomic commits
- Avoid committing secrets (`.env`, tokens, credentials)

## Pull Requests
PRs should:
- Describe the **why** (not just the what)
- Include tests or clear QA steps
- Keep scope small

## CI / Required Checks
We require:
- typecheck
- tests
- build
