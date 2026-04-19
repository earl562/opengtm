# Security & Trust Boundaries

## No secrets in repo
- Never commit tokens/keys.
- Local-only secrets via environment variables.

## Approvals
- Mutations (send-message, browser-act, write-repo, mutate-connector) are approval-gated by default.

## Logging
- Logs and traces must never include secret material.

## Runtime logs
- CLI runs write per-run JSONL logs under the runtime root (default `./.opengtm/runtime/logs/`).
- Each trace stores `logFilePath` pointing at `run-<traceId>.jsonl`.
