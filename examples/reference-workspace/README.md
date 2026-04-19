# Reference Workspace

This folder is a minimal public-facing example of how to structure an OpenGTM workspace.

## Suggested flow

```bash
cp examples/reference-workspace/opengtm.config.example.json .opengtm/config.json
opengtm workflow
opengtm run workflow sdr.lead_research "research Acme"
opengtm traces list
opengtm evals run smoke
```

## Included concepts
- workspace config shape
- reference workflows
- trace replay/debug loop
- approval and feedback flow
