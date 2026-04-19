# Canonical Externalization Eval Report

- suite: `longitudinal`
- canonical scenario: `crm.roundtrip`
- pass: **true**

## Dimensions

- successRate: 100 (threshold 100)
- replayConsistency: 100 (threshold 100)
- rerunContinuity: 100 (threshold 100)
- activityContinuity: 100 (threshold 100)

## Observed Deltas


## Evidence

```json
{
  "runCount": 3,
  "activityCount": 3,
  "runs": [
    {
      "workflowState": "awaiting-approval",
      "approvalState": "approved",
      "replayMode": "deterministic-replay",
      "rerunState": "awaiting-approval"
    },
    {
      "workflowState": "awaiting-approval",
      "approvalState": "approved",
      "replayMode": "deterministic-replay",
      "rerunState": "awaiting-approval"
    },
    {
      "workflowState": "awaiting-approval",
      "approvalState": "approved",
      "replayMode": "deterministic-replay",
      "rerunState": "awaiting-approval"
    }
  ]
}
```