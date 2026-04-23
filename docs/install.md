# Install

## Requirements

- Node.js `>= 22`
- npm `>= 11`
- macOS if you want the current Seatbelt sandbox path

## Install the CLI

### From npm

```bash
npm install -g opengtm
opengtm
```

### From source

```bash
git clone https://github.com/earl562/opengtm.git
cd opengtm

npm ci
npm run build
node packages/cli/bin/opengtm.js
```

## Bootstrap a workspace

```bash
opengtm init --name="My Workspace" --initiative="Q2 Pipeline"
opengtm status
```

## Launch the interactive harness

```bash
opengtm
```

Inside the session you can type:

```text
Research Acme
Draft outreach for Pat Example
Check account health for Acme
Scan deal risk for Acme
Show approvals
Why was this blocked?
What do you know about this account?
What's pending?
Research Acme and draft outreach for Acme
/help
```

Use `opengtm help` for the non-interactive dashboard/help surface, `opengtm session status` to inspect the current session, and `opengtm session transcript --limit=20` to review recent harness messages.
Inside the session, `/auth`, `/provider`, and `/models` expose the configured model control plane without leaving the harness loop.

## Configure a provider

### OpenAI

```bash
opengtm auth login openai
# then paste the redirect URL back into:
# opengtm auth login openai --oauth-redirect-url="http://127.0.0.1:1455/auth/callback?code=...&state=..."
opengtm provider use openai
opengtm models list
opengtm models use gpt-5.2
```

### Notes on OpenAI auth

OpenGTM’s OpenAI login flow uses a PKCE-based OAuth path modeled after modern agentic harnesses. After login completes, OpenGTM stores the resulting token set in its local auth store and uses that session for provider access.

The built-in OpenAI model menu is a curated default catalog; if OpenAI adds or renames models later, you can still switch to a custom model id with `opengtm models use <model-id>`.
Once OpenAI is configured for the workspace, OpenGTM uses that provider in research and drafting flows so you can test the harness with your own credentials.

## Check sandbox posture

```bash
opengtm sandbox status
opengtm sandbox profile list
opengtm sandbox explain --profile read-only
opengtm sandbox run --preview --profile read-only -- /bin/echo sandbox-ok
```

## Run the canonical GTM workflow

```bash
opengtm
# then inside the session:
# Research Pat Example
# Show approvals
# Why was this blocked?
```

## Validation commands

```bash
npm run typecheck
npm test
npm run build
npm run pack:check
```
