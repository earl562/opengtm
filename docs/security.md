# Security & Trust Boundaries

## No secrets in repo
- Never commit tokens/keys.
- `.opengtm/` is gitignored.
- Current CLI auth can use either:
  - environment-variable references (`--api-key-env=...`)
  - local ignored credential storage for manual testing (`auth.json` under `.opengtm/`)

## Provider auth truthfulness
- OpenGTM supports a PKCE-based OAuth flow for the built-in OpenAI provider.
- Custom OpenAI-compatible endpoints remain API-key based.
- The auth store may contain pending PKCE state, OAuth tokens, or API-key credentials depending on provider mode.

## Approvals
- Mutations (send-message, browser-act, write-repo, mutate-connector) are approval-gated by default.

## Sandbox posture
- macOS sandbox posture is surfaced through Seatbelt/`sandbox-exec`.
- Use `opengtm sandbox status`, `opengtm sandbox profile list`, and `opengtm sandbox explain`.
- In nested sandboxed environments, `sandbox-exec` itself may be blocked; OpenGTM reports that condition rather than silently pretending sandboxing occurred.

## Logging
- Logs and traces must never include secret material.

## Runtime logs
- CLI runs write per-run JSONL logs under the runtime root (default `./.opengtm/runtime/logs/`).
- Each trace stores `logFilePath` pointing at `run-<traceId>.jsonl`.
