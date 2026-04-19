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
  "pendingTraceId": "aef5294b-d93b-412e-bdeb-6c2881f82e2b",
  "approvedTraceId": "aef5294b-d93b-412e-bdeb-6c2881f82e2b",
  "rerunTraceId": "7cb1c247-6511-461e-aa74-e9b9ec02c552",
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