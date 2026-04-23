# OpenGTM CLI Harness Redesign

This design records the current harness direction for OpenGTM.

It is guided by:

- the OpenDev paper (`2603.05344v3` / PDF)
- OpenGTM's own walkthrough and demo flows
- modern agentic CLI patterns validated in OpenClaw and Hermes

## Goals

- Make `opengtm` open into a keyboard-first interactive harness
- Keep the command composer as the primary interaction surface
- Surface approvals, next actions, transcript, and runtime context without flooding the operator
- Separate UI concerns from session, runtime, and dispatch logic
- Support OpenAI PKCE OAuth so the harness can be tested end to end with a modern provider login flow

## Paper-aligned primitives

### Entry and UI layer

- `packages/cli/src/index.ts` enters through `runInteractiveHarnessSession`
- `packages/cli/src/interactive-ink.ts` owns the Ink shell
- `packages/cli/src/interactive.ts` retains session state, dispatch, intent parsing, and runtime orchestration

This follows the OpenDev split between UI entry and deeper harness logic.

### Persistence layer

- session state persists under `.opengtm/runtime/sessions`
- auth state persists under `.opengtm/auth.json`
- the OAuth flow uses a pending PKCE record and a token record

### Safety and approvals

- approval state is elevated to the dominant workspace view when a gate exists
- the action rail and approval rail remain visible at all times

### Context discipline

- the main workspace shows the most relevant view for the current state
- transcript is summarized in a bounded panel instead of dominating the shell
- control-plane details and runtime summary live in compact side cards

## Ink shell layout

The shell is organized into three bands.

### Header

- product identity
- current provider/model
- runtime status
- approval count

### Body

Two-column layout.

#### Main workspace

The main workspace is the dominant area. It conditionally renders:

- approval-required state
- action-detail state
- latest-result state
- help overlay
- command palette overlay
- welcome state

#### Sidebar

The sidebar remains stable and high signal:

- next actions
- approvals
- control plane
- runtime summary

### Composer footer

The composer is always visible and remains the primary interaction surface.

- buffered text
- ready/processing state
- keyboard hints

## Navigation model

- natural language and slash commands share one composer
- `Tab` / `Shift+Tab` switch panes
- arrow keys navigate or move cursor depending on mode
- `Enter` submits or activates the focused item path
- `?` toggles help
- `Ctrl+K` toggles the command palette
- `Ctrl+L` clears visible output without resetting session context
- `Ctrl+C` exits the shell

The shell delegates key semantics to `applyInteractiveTerminalKey`, preserving existing interaction behavior while changing the presentation layer.

## OpenAI OAuth design

OpenGTM now supports an OpenAI PKCE OAuth path for the `openai` provider.

### Start flow

`opengtm auth login openai`

Behavior:

- generates PKCE verifier/challenge and state
- creates an authorization URL
- stores a pending PKCE record in `.opengtm/auth.json`
- optionally opens the system browser
- prints the auth URL and the exact completion command

### Complete flow

`opengtm auth login openai --oauth-redirect-url="http://127.0.0.1:1455/auth/callback?code=...&state=..."`

Behavior:

- validates the callback state
- exchanges the code at `https://auth.openai.com/oauth/token`
- stores access token, refresh token, expiry, and account id in `.opengtm/auth.json`
- updates workspace auth config to `oauth`

### Refresh behavior

When runtime provider resolution sees an OAuth-backed provider:

- it loads the stored token set
- if the token is near expiry and a refresh token exists, it refreshes automatically
- it persists the refreshed token set back into the auth store

## Files involved

- `packages/cli/src/interactive.ts`
- `packages/cli/src/interactive-ink.ts`
- `packages/cli/src/handlers/auth.ts`
- `packages/cli/src/oauth.ts`
- `packages/cli/src/credentials.ts`
- `packages/cli/src/provider-runtime.ts`
- `packages/cli/src/router.ts`
- `packages/cli/src/render/human.ts`

## Validation commands

Build:

```bash
npm run build
```

Interactive shell:

```bash
node packages/cli/bin/opengtm.js
```

OpenAI OAuth start:

```bash
node packages/cli/bin/opengtm.js auth login openai --no-open
```

OpenAI OAuth completion:

```bash
node packages/cli/bin/opengtm.js auth login openai --oauth-redirect-url="http://127.0.0.1:1455/auth/callback?code=...&state=..."
```

Auth status:

```bash
node packages/cli/bin/opengtm.js auth status openai
```

tmux smoke test:

```bash
tmux new-session -d -s opengtm-redesign-test -c /path/to/opengtm
tmux send-keys -t opengtm-redesign-test "node packages/cli/bin/opengtm.js" Enter
tmux capture-pane -p -t opengtm-redesign-test -S -250
```

## Next iterations

- make the palette a truly selectable list instead of a static overlay card
- expose auth/model controls directly in the shell surface
- add richer event/activity cards without overwhelming the operator
- add provider-aware session routing once multiple OAuth/API-key profiles are supported simultaneously
