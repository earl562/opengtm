# Demo: OpenGTM (CLI-first)

## Prereqs
- Node.js >= 22

## Run the demo

```bash
npm ci
npm -w @opengtm/cli run build

rm -rf .opengtm
node packages/cli/bin/opengtm.js init --name=Demo

# Research lane (creates a trace + artifact + working-memory record)
node packages/cli/bin/opengtm.js run research "Find top 3 competitors"
node packages/cli/bin/opengtm.js traces list
node packages/cli/bin/opengtm.js artifacts list
node packages/cli/bin/opengtm.js memory list

# Build lane (creates policy decision + approval request)
node packages/cli/bin/opengtm.js run build "Change README"
node packages/cli/bin/opengtm.js approvals list
```

## Discord (optional)
The Discord gateway is a separate package. It registers `/opengtm` commands and emits gateway events.

You need:
- Discord bot token
- Discord application client id
- optional: guild id (recommended during development)

The gateway supports:
- `/opengtm help`
- `/opengtm status`
- `/opengtm init`
- `/opengtm run lane:<research|build|ops> goal:<...>`
- `/opengtm approvals`

Approvals are rendered with Approve/Deny buttons.
