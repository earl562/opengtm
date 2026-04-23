# Demo: OpenGTM CLI

This is the shortest end-to-end manual demo for a first-time evaluator.

## 1. Start clean

```bash
git clone https://github.com/earl562/opengtm.git
cd opengtm

npm ci
npm run build
rm -rf .opengtm
```

## 2. Open the CLI shell

```bash
node packages/cli/bin/opengtm.js
# inside the session try:
# Research Acme
# Show approvals
# Why was this blocked?
# /exit

node packages/cli/bin/opengtm.js help --json
```

## 3. Initialize a workspace

```bash
node packages/cli/bin/opengtm.js init --name="Demo Workspace" --initiative="Canonical Flow"
node packages/cli/bin/opengtm.js status
```

## 4. Configure the control plane

```bash
node packages/cli/bin/opengtm.js auth login openai --no-open
node packages/cli/bin/opengtm.js provider use openai
node packages/cli/bin/opengtm.js models list
node packages/cli/bin/opengtm.js sandbox status
node packages/cli/bin/opengtm.js sandbox explain --profile read-only
```

## 5. Run the GTM workflow

```bash
node packages/cli/bin/opengtm.js
# then inside the session:
# Research Pat Example
# Show approvals
# /approve <approval-id>
# /traces

node packages/cli/bin/opengtm.js workflow list
node packages/cli/bin/opengtm.js workflow run crm.roundtrip "Pat Example"
node packages/cli/bin/opengtm.js approvals list
node packages/cli/bin/opengtm.js approvals approve <approval-id>
node packages/cli/bin/opengtm.js traces list
node packages/cli/bin/opengtm.js traces replay <trace-id>
```

## 6. Inspect extension surfaces

```bash
node packages/cli/bin/opengtm.js skill list
node packages/cli/bin/opengtm.js skill new outbound_followup
node packages/cli/bin/opengtm.js agent list
node packages/cli/bin/opengtm.js agent new research_assistant
node packages/cli/bin/opengtm.js learn review
```

## 7. Evaluate the harness

```bash
node packages/cli/bin/opengtm.js evals run canonical
node packages/cli/bin/opengtm.js evals run longitudinal
node packages/cli/bin/opengtm.js smoke
```
