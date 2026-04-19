# Demo: OpenGTM (CLI-first)

## Prereqs
- Node.js >= 22

## Run the demo

```bash
git clone https://github.com/earl562/opengtm opengtm
cd opengtm

npm ci
npm -w @opengtm/cli run build

rm -rf .opengtm
node packages/cli/bin/opengtm.js init --name=Demo

# Research lane (creates a trace + artifact + working-memory record)
node packages/cli/bin/opengtm.js run research "Find top 3 competitors"
node packages/cli/bin/opengtm.js traces list
node packages/cli/bin/opengtm.js traces show <trace-id>
node packages/cli/bin/opengtm.js artifacts list
node packages/cli/bin/opengtm.js memory list

# Build lane (creates policy decision + approval request)
node packages/cli/bin/opengtm.js run build "Change README"
node packages/cli/bin/opengtm.js approvals list

# Workflow catalog + public workflow runs
node packages/cli/bin/opengtm.js workflow
node packages/cli/bin/opengtm.js run workflow crm.roundtrip "Pat Example"
node packages/cli/bin/opengtm.js approvals list
node packages/cli/bin/opengtm.js approvals approve <approval-id>

# Eval and replay surfaces
node packages/cli/bin/opengtm.js evals run smoke
node packages/cli/bin/opengtm.js evals run canonical
node packages/cli/bin/opengtm.js traces replay <trace-id>
node packages/cli/bin/opengtm.js traces rerun <trace-id>
```

## Logs
Each CLI run writes a per-run JSONL log under the runtime root:

- Default runtime root: `./.opengtm/runtime` (configurable via `.opengtm/config.json` `runtimeDir`)
- Log directory: `./.opengtm/runtime/logs/`
- Per-run file: `run-<traceId>.jsonl`

Traces persist the absolute `logFilePath` so you can link a trace to its JSONL file.

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
