# Walkthrough: Evaluate OpenGTM like a real user

This walkthrough is aimed at someone arriving from GitHub who wants to try a serious agentic harness, not just read source code.

## Step 1 — Install and inspect the shell

```bash
npm install -g opengtm
opengtm
opengtm help --json
```

What to look for:

- the top-level command should open an interactive harness session
- help should be grouped by operator concern
- JSON output should exist for machine use

## Step 2 — Bootstrap a workspace

```bash
opengtm init --name="Acme GTM" --initiative="Pipeline Lift"
opengtm status
```

Confirm:

- quoted values work
- status shows workspace, initiative, provider, model, and sandbox profile
- `opengtm session status` and `opengtm session transcript` let you inspect the live session outside the interactive loop

## Step 3 — Configure provider + model

```bash
opengtm auth login openai
opengtm provider list
opengtm provider use openai
opengtm models list
opengtm models use gpt-5.2
opengtm status
```

Inside the interactive harness, you can inspect the same control plane with:

```text
/auth
/provider
/models
```

Confirm:

- auth status is masked
- provider/model selections persist
- the CLI stays truthful about supported auth modes

## Step 4 — Review sandbox posture

```bash
opengtm sandbox status
opengtm sandbox profile list
opengtm sandbox explain --profile read-only
opengtm sandbox run --preview --profile read-only -- /bin/echo sandbox-ok
```

Confirm:

- Seatbelt availability is surfaced
- profiles are documented in human-readable form
- preview mode lets you inspect the policy before execution

## Step 5 — Run the canonical GTM path

```bash
opengtm
# inside the session:
# Research Pat Example
# Check account health for Acme
# Scan deal risk for Acme
# Research Acme and draft outreach for Acme
# Show approvals
# Why was this blocked?
# What's pending?
# What do you know about this account?
```

You can still use the explicit control plane too:

```bash
opengtm workflow list
opengtm workflow run crm.roundtrip "Pat Example"
opengtm approvals list
opengtm traces list
```

Confirm:

- live vs reference-only workflows are explicit
- approvals and traces are operator-visible
- artifacts and recovery/debug outputs are referenced

## Step 6 — Exercise the extension surface

```bash
opengtm skill list
opengtm skill new outbound_followup
opengtm agent list
opengtm agent new research_assistant
opengtm learn review
```

Confirm:

- skills/agents are discoverable
- new scaffolds land in `.opengtm/`
- learning is review-oriented, not silent self-modification

## Step 7 — Run evals

```bash
opengtm evals run canonical
opengtm evals run longitudinal
opengtm smoke
```

Confirm:

- the harness can be verified from the same CLI surface
- benchmark/debug outputs remain inspectable
