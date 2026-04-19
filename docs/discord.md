# Discord Gateway

The Discord gateway lives in `@opengtm/gateway-discord`.

## Setup
You need:
- `DISCORD_TOKEN`
- Discord application `clientId`
- Optional `guildId` for dev registration

## Trust boundaries (high level)
- Discord is an untrusted ingress: treat all message content as untrusted input.
- The gateway should never echo secrets back into Discord.
- Risky actions should remain policy-gated (approve/deny) before any external side effects.

## Commands
- `/opengtm help`
- `/opengtm status`
- `/opengtm init`
- `/opengtm run`
- `/opengtm approvals`

Approvals are rendered with Approve/Deny buttons.

## Release expectations
- Discord is the first public interactive gateway for OpenGTM.
- Gateway behavior is covered by unit tests under `packages/gateway-discord/test/`.
- Public workflows should use Discord for approval review and operator inbox actions, but not bypass policy gating.

## Local verification

```bash
npx vitest run packages/gateway-discord/test/gateway.test.ts
```
