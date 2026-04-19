# Canonical Debug Bundle

- generatedAt: 2026-04-19T18:05:36.436Z
- canonical scenario: crm.roundtrip

## Workflow Run
```json
{
  "workflow": {
    "id": "crm.roundtrip",
    "name": "Canonical CRM Roundtrip",
    "description": "Ingest a lead.created event, produce research and outreach artifacts, route approval, and log the outcome back to the local CRM fixture.",
    "trigger": "manual",
    "lane": "ops-automate",
    "persona": "SDR",
    "fixtureSetId": "crm-roundtrip",
    "connectorFamilies": [
      "crm",
      "docs",
      "comms"
    ],
    "artifactKinds": [
      "analysis",
      "approval",
      "trace"
    ],
    "requiresApproval": true,
    "supportTier": "live",
    "isCanonical": true
  },
  "workflowRun": {
    "id": "aea84e2f-71d3-4554-bb89-302da41e9e5e",
    "status": "awaiting-approval"
  },
  "workflowId": "crm.roundtrip",
  "workflowRunId": "aea84e2f-71d3-4554-bb89-302da41e9e5e",
  "lane": "ops-automate",
  "workflowState": "awaiting-approval",
  "persona": "SDR",
  "fixtureSetId": "crm-roundtrip",
  "supportTier": "live",
  "isCanonical": true,
  "canonicalScenarioId": "crm.roundtrip",
  "traceId": "4a53f3ea-f8fa-48a2-8514-56d9517605d2",
  "logFilePath": "/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/logs/run-4a53f3ea-f8fa-48a2-8514-56d9517605d2.jsonl",
  "approvalRequestId": "21a1bf65-aa3a-49fe-bffb-d18fdc723246",
  "artifactId": "09c15106-840c-4c72-ba95-46491a7af446",
  "artifactPath": "/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/artifacts/global/09c15106-840c-4c72-ba95-46491a7af446.json",
  "nextAction": "Approve or deny the canonical CRM roundtrip outreach draft, then inspect CRM activity, traces, and feedback lineage."
}
```

## Approval
```json
{
  "action": "approve",
  "approval": {
    "id": "21a1bf65-aa3a-49fe-bffb-d18fdc723246",
    "createdAt": "2026-04-19T18:05:35.354Z",
    "workspaceId": "cfa4c7c0-8b92-49d7-bca8-c5caee21531a",
    "workItemId": "97397a71-3777-406d-babf-4e0297b899a9",
    "lane": "ops-automate",
    "actionSummary": "Ops action requires approval: Draft outreach for CI Artifact Lead",
    "riskLevel": "critical",
    "target": "Draft outreach for CI Artifact Lead",
    "status": "approved",
    "decisionRef": "0f3c5cf8-1c6c-435d-a534-e7a92f9aab88"
  },
  "workItem": {
    "id": "97397a71-3777-406d-babf-4e0297b899a9",
    "title": "Ops: Draft outreach for CI Artifact Lead",
    "status": "completed"
  },
  "trace": {
    "id": "4a53f3ea-f8fa-48a2-8514-56d9517605d2",
    "status": "completed",
    "logFilePath": "/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/logs/run-4a53f3ea-f8fa-48a2-8514-56d9517605d2.jsonl"
  },
  "artifact": {
    "id": "889a409e-0bda-48c9-9d0f-09ad5fb2ae7b",
    "path": "/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/artifacts/global/889a409e-0bda-48c9-9d0f-09ad5fb2ae7b.json",
    "title": "Ops execution: Draft outreach for CI Artifact Lead"
  },
  "approvals": [
    {
      "id": "21a1bf65-aa3a-49fe-bffb-d18fdc723246",
      "createdAt": "2026-04-19T18:05:35.354Z",
      "workspaceId": "cfa4c7c0-8b92-49d7-bca8-c5caee21531a",
      "workItemId": "97397a71-3777-406d-babf-4e0297b899a9",
      "lane": "ops-automate",
      "actionSummary": "Ops action requires approval: Draft outreach for CI Artifact Lead",
      "riskLevel": "critical",
      "target": "Draft outreach for CI Artifact Lead",
      "status": "approved",
      "decisionRef": "0f3c5cf8-1c6c-435d-a534-e7a92f9aab88"
    }
  ],
  "summary": {
    "total": 1,
    "pending": 0,
    "approved": 1,
    "denied": 0,
    "nextAction": "Approval recorded. The queued build workflow resumed, wrote a continuation artifact, and completed successfully.",
    "workflowState": "completed",
    "workItemState": "completed",
    "approvalState": "approved"
  }
}
```

## Trace
```json
{
  "trace": {
    "id": "4a53f3ea-f8fa-48a2-8514-56d9517605d2",
    "createdAt": "2026-04-19T18:05:35.352Z",
    "workItemId": "97397a71-3777-406d-babf-4e0297b899a9",
    "workflowId": "crm.roundtrip",
    "lane": "ops-automate",
    "status": "completed",
    "steps": [
      {
        "name": "load-context",
        "status": "completed"
      },
      {
        "name": "prepare-action",
        "status": "completed"
      },
      {
        "name": "approve-or-send",
        "status": "completed"
      },
      {
        "name": "record-outcome",
        "status": "completed"
      }
    ],
    "persona": "SDR",
    "fixtureSetId": "crm-roundtrip",
    "debugBundlePath": "/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/logs/run-4a53f3ea-f8fa-48a2-8514-56d9517605d2.jsonl",
    "logFilePath": "/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/logs/run-4a53f3ea-f8fa-48a2-8514-56d9517605d2.jsonl",
    "toolCalls": [],
    "connectorCalls": [
      {
        "provider": "opengtm-crm",
        "family": "crm",
        "action": "mutate-connector",
        "target": "activities",
        "executionMode": "live",
        "supportTier": "live",
        "crmActivityId": "716a62ae-105a-4d8c-b4d5-73441a09731a"
      }
    ],
    "policyDecisionIds": [],
    "artifactIds": [
      "889a409e-0bda-48c9-9d0f-09ad5fb2ae7b",
      "9d3aa316-aa34-4764-914f-757990969325"
    ],
    "feedbackEventIds": [
      "e7cb2ddb-d4d3-4dcf-854e-6ef358091c75"
    ],
    "runAttemptId": null,
    "observedFacts": [
      {
        "kind": "truthfulness",
        "scope": "ops-approval-resume",
        "supportTier": "live",
        "approvalRequestId": "21a1bf65-aa3a-49fe-bffb-d18fdc723246",
        "checkpointId": "aea84e2f-71d3-4554-bb89-302da41e9e5e-post-research",
        "crmActivityId": "716a62ae-105a-4d8c-b4d5-73441a09731a"
      },
      {
        "kind": "recovery-semantics",
        "scope": "ops-approval-resume",
        "reversibleEffects": [
          "research-artifact",
          "approval-artifact"
        ],
        "resumableEffects": [
          "approval-gate",
          "draft-review"
        ],
        "operatorInterventionRequired": [
          "crm-activity-log"
        ],
        "rollbackOutcome": "operator-intervention-required"
      },
      {
        "kind": "rollback-preview",
        "scope": "ops-approval-resume",
        "artifactId": "9d3aa316-aa34-4764-914f-757990969325",
        "candidateDeletionsByTable": {
          "work_items": 1,
          "run_traces": 1,
          "artifacts": 2,
          "memory_records": 0,
          "policy_decisions": 1,
          "approval_requests": 1,
          "feedback_records": 1
        }
      }
    ],
    "inferences": [],
    "actionRequests": [],
    "redactionMarkers": [],
    "startedAt": "2026-04-19T18:05:35.352Z",
    "endedAt": "2026-04-19T18:05:35.478Z"
  },
  "workItem": {
    "id": "97397a71-3777-406d-babf-4e0297b899a9",
    "createdAt": "2026-04-19T18:05:35.351Z",
    "workspaceId": "cfa4c7c0-8b92-49d7-bca8-c5caee21531a",
    "initiativeId": "0a193f2e-7a22-4a43-a281-6b8c41a555b4",
    "workflowId": "crm.roundtrip",
    "workflowRunId": "aea84e2f-71d3-4554-bb89-302da41e9e5e",
    "journeyId": null,
    "ownerLane": "ops-automate",
    "title": "Ops: Draft outreach for CI Artifact Lead",
    "goal": "Draft outreach for CI Artifact Lead",
    "status": "completed",
    "riskLevel": "low",
    "leaseOwner": null,
    "leaseExpiresAt": null,
    "constraints": [],
    "requiredOutputs": [],
    "sourceIds": [
      "1fa35e4b-933e-4562-82c8-225fdc7b9cf8",
      "4c3523e1-9b00-4bd8-b3c1-126c0be6f393"
    ],
    "connectorTargets": [
      "crm-db:/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/fixtures/opengtm-crm.sqlite",
      "crm-lead:68ac6631-ab73-4207-9a40-be0d8fa6f50b",
      "checkpoint:aea84e2f-71d3-4554-bb89-302da41e9e5e-post-research",
      "checkpoint-at:2026-04-19T18:05:35.350Z"
    ]
  },
  "feedback": [
    {
      "id": "e7cb2ddb-d4d3-4dcf-854e-6ef358091c75",
      "createdAt": "2026-04-19T18:05:35.467Z",
      "workspaceId": "cfa4c7c0-8b92-49d7-bca8-c5caee21531a",
      "traceId": "4a53f3ea-f8fa-48a2-8514-56d9517605d2",
      "approvalRequestId": "21a1bf65-aa3a-49fe-bffb-d18fdc723246",
      "artifactId": null,
      "workflowId": "crm.roundtrip",
      "persona": "SDR",
      "action": "approve",
      "actor": "operator",
      "message": "Approved Ops action requires approval: Draft outreach for CI Artifact Lead"
    }
  ],
  "summary": {
    "feedbackCount": 1,
    "nextAction": "Inspect the trace metadata, then replay it or continue the linked workflow."
  }
}
```

## Replay
```json
{
  "mode": "deterministic-replay",
  "trace": {
    "id": "4a53f3ea-f8fa-48a2-8514-56d9517605d2",
    "createdAt": "2026-04-19T18:05:35.352Z",
    "workItemId": "97397a71-3777-406d-babf-4e0297b899a9",
    "workflowId": "crm.roundtrip",
    "lane": "ops-automate",
    "status": "completed",
    "steps": [
      {
        "name": "load-context",
        "status": "completed"
      },
      {
        "name": "prepare-action",
        "status": "completed"
      },
      {
        "name": "approve-or-send",
        "status": "completed"
      },
      {
        "name": "record-outcome",
        "status": "completed"
      }
    ],
    "persona": "SDR",
    "fixtureSetId": "crm-roundtrip",
    "debugBundlePath": "/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/logs/run-4a53f3ea-f8fa-48a2-8514-56d9517605d2.jsonl",
    "logFilePath": "/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/logs/run-4a53f3ea-f8fa-48a2-8514-56d9517605d2.jsonl",
    "toolCalls": [],
    "connectorCalls": [
      {
        "provider": "opengtm-crm",
        "family": "crm",
        "action": "mutate-connector",
        "target": "activities",
        "executionMode": "live",
        "supportTier": "live",
        "crmActivityId": "716a62ae-105a-4d8c-b4d5-73441a09731a"
      }
    ],
    "policyDecisionIds": [],
    "artifactIds": [
      "889a409e-0bda-48c9-9d0f-09ad5fb2ae7b",
      "9d3aa316-aa34-4764-914f-757990969325"
    ],
    "feedbackEventIds": [
      "e7cb2ddb-d4d3-4dcf-854e-6ef358091c75"
    ],
    "runAttemptId": null,
    "observedFacts": [
      {
        "kind": "truthfulness",
        "scope": "ops-approval-resume",
        "supportTier": "live",
        "approvalRequestId": "21a1bf65-aa3a-49fe-bffb-d18fdc723246",
        "checkpointId": "aea84e2f-71d3-4554-bb89-302da41e9e5e-post-research",
        "crmActivityId": "716a62ae-105a-4d8c-b4d5-73441a09731a"
      },
      {
        "kind": "recovery-semantics",
        "scope": "ops-approval-resume",
        "reversibleEffects": [
          "research-artifact",
          "approval-artifact"
        ],
        "resumableEffects": [
          "approval-gate",
          "draft-review"
        ],
        "operatorInterventionRequired": [
          "crm-activity-log"
        ],
        "rollbackOutcome": "operator-intervention-required"
      },
      {
        "kind": "rollback-preview",
        "scope": "ops-approval-resume",
        "artifactId": "9d3aa316-aa34-4764-914f-757990969325",
        "candidateDeletionsByTable": {
          "work_items": 1,
          "run_traces": 1,
          "artifacts": 2,
          "memory_records": 0,
          "policy_decisions": 1,
          "approval_requests": 1,
          "feedback_records": 1
        }
      }
    ],
    "inferences": [],
    "actionRequests": [],
    "redactionMarkers": [],
    "startedAt": "2026-04-19T18:05:35.352Z",
    "endedAt": "2026-04-19T18:05:35.478Z"
  },
  "workItem": {
    "id": "97397a71-3777-406d-babf-4e0297b899a9",
    "createdAt": "2026-04-19T18:05:35.351Z",
    "workspaceId": "cfa4c7c0-8b92-49d7-bca8-c5caee21531a",
    "initiativeId": "0a193f2e-7a22-4a43-a281-6b8c41a555b4",
    "workflowId": "crm.roundtrip",
    "workflowRunId": "aea84e2f-71d3-4554-bb89-302da41e9e5e",
    "journeyId": null,
    "ownerLane": "ops-automate",
    "title": "Ops: Draft outreach for CI Artifact Lead",
    "goal": "Draft outreach for CI Artifact Lead",
    "status": "completed",
    "riskLevel": "low",
    "leaseOwner": null,
    "leaseExpiresAt": null,
    "constraints": [],
    "requiredOutputs": [],
    "sourceIds": [
      "1fa35e4b-933e-4562-82c8-225fdc7b9cf8",
      "4c3523e1-9b00-4bd8-b3c1-126c0be6f393"
    ],
    "connectorTargets": [
      "crm-db:/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/fixtures/opengtm-crm.sqlite",
      "crm-lead:68ac6631-ab73-4207-9a40-be0d8fa6f50b",
      "checkpoint:aea84e2f-71d3-4554-bb89-302da41e9e5e-post-research",
      "checkpoint-at:2026-04-19T18:05:35.350Z"
    ]
  },
  "feedback": [
    {
      "id": "e7cb2ddb-d4d3-4dcf-854e-6ef358091c75",
      "createdAt": "2026-04-19T18:05:35.467Z",
      "workspaceId": "cfa4c7c0-8b92-49d7-bca8-c5caee21531a",
      "traceId": "4a53f3ea-f8fa-48a2-8514-56d9517605d2",
      "approvalRequestId": "21a1bf65-aa3a-49fe-bffb-d18fdc723246",
      "artifactId": null,
      "workflowId": "crm.roundtrip",
      "persona": "SDR",
      "action": "approve",
      "actor": "operator",
      "message": "Approved Ops action requires approval: Draft outreach for CI Artifact Lead"
    }
  ],
  "summary": {
    "feedbackCount": 1,
    "nextAction": "This replay is read-only recorded state. Use traces rerun <trace-id> to re-execute the underlying workflow or lane."
  }
}
```

## Rerun
```json
{
  "workflow": {
    "id": "crm.roundtrip",
    "name": "Canonical CRM Roundtrip",
    "description": "Ingest a lead.created event, produce research and outreach artifacts, route approval, and log the outcome back to the local CRM fixture.",
    "trigger": "manual",
    "lane": "ops-automate",
    "persona": "SDR",
    "fixtureSetId": "crm-roundtrip",
    "connectorFamilies": [
      "crm",
      "docs",
      "comms"
    ],
    "artifactKinds": [
      "analysis",
      "approval",
      "trace"
    ],
    "requiresApproval": true,
    "supportTier": "live",
    "isCanonical": true
  },
  "workflowRun": {
    "id": "713c23d3-68fc-43ed-97ad-51410db0ab36",
    "status": "awaiting-approval"
  },
  "workflowId": "crm.roundtrip",
  "workflowRunId": "713c23d3-68fc-43ed-97ad-51410db0ab36",
  "lane": "ops-automate",
  "workflowState": "awaiting-approval",
  "persona": "SDR",
  "fixtureSetId": "crm-roundtrip",
  "supportTier": "live",
  "isCanonical": true,
  "canonicalScenarioId": "crm.roundtrip",
  "traceId": "0ad7c757-bbf4-41d8-bacc-7fef002da03c",
  "logFilePath": "/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/logs/run-0ad7c757-bbf4-41d8-bacc-7fef002da03c.jsonl",
  "approvalRequestId": "5c695fd0-3dda-4cb5-b87a-a0eb8f7914d3",
  "artifactId": "c995cbf7-8380-4a97-b1f7-86cdc5a89062",
  "artifactPath": "/private/var/folders/sx/_p5d2mn10q56tdsxxsp0lbsc0000gn/T/opengtm-ci-report-4DaewL/.opengtm/runtime/artifacts/global/c995cbf7-8380-4a97-b1f7-86cdc5a89062.json",
  "nextAction": "Approve or deny the canonical CRM roundtrip outreach draft, then inspect CRM activity, traces, and feedback lineage."
}
```