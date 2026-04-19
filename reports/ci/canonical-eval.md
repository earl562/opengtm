# Canonical Externalization Eval Report

- suite: `canonical`
- canonical scenario: `crm.roundtrip`
- pass: **true**

## Dimensions

- transferability: 90 (threshold 80)
- maintainability: 88 (threshold 80)
- recoveryRobustness: 90 (threshold 80)
- contextEfficiency: 92 (threshold 80)
- governanceQuality: 94 (threshold 85)

## Observed Deltas

- policyGatingOff: -40.83333333333333 (expected <= -10)
- skillLoadingOff: -8.333333333333329 (expected <= -5)

## Evidence

```json
{
  "pendingTraceId": "e95e40e4-b3ab-4a6f-a055-e0593b94e074",
  "approvedTraceId": "e95e40e4-b3ab-4a6f-a055-e0593b94e074",
  "rerunTraceId": "a82aef0d-22fa-41aa-bb87-53c73265e871",
  "approvalCount": 3,
  "feedbackCount": 2,
  "activityCount": 2,
  "contextBudgetOmissions": [
    "working-context",
    "disclosed-skills",
    "connector-guidance"
  ]
}
```