# OpenGTM CRM (clean-room)

This repository is a clean-room scaffold for a minimal CRM backend used by OpenGTM.

Clean-room note: this codebase was written from scratch for this repo. It does not copy code or assets from Twenty or any other CRM.

## What is included

- Minimal CRM entities: Account, Contact, Lead, Opportunity, Activity
- SQLite storage using Node built-in `node:sqlite` (Node >= 22)
- Minimal HTTP API using `node:http` (no heavy frameworks)
- Vitest tests (offline) that create/list entities against a temp SQLite DB

## Quickstart

Requirements: Node >= 22

```bash
npm ci
npm run typecheck
npm test
npm run build
node dist/server.js
```

By default the server uses a local SQLite file `./opengtm-crm.sqlite`.

### API

- `GET /accounts` / `POST /accounts`
- `GET /leads` / `POST /leads`
- `GET /activities` / `POST /activities`

Examples:

```bash
curl -s -X POST http://localhost:3000/accounts \
  -H 'content-type: application/json' \
  -d '{"name":"Acme"}'

curl -s http://localhost:3000/accounts
```

## License

MIT
