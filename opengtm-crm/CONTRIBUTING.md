# Contributing

Thanks for helping improve OpenGTM CRM.

## Development

Requirements: Node >= 22

```bash
npm ci
npm run typecheck
npm test
npm run build
```

## Running the server

```bash
npm run build
node dist/server.js
```

Environment variables:

- `PORT` (default: `3000`)
- `DATABASE_URL` (default: `./opengtm-crm.sqlite`)

## Pull requests

- Keep changes small and focused.
- Add or update tests when behavior changes.
- No network access in tests.
- Do not commit secrets, `.env` files, or database files.
