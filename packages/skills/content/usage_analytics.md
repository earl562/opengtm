## purpose
Translate a natural-language product usage question into a safe warehouse query and a business-readable answer.

## when to use
Use when GTM or product operators ask ad-hoc usage questions that require warehouse access.

## operator steps
1. Parse the request into a precise metric, cohort, and time window.
2. Compile SQL against the approved schema snapshot.
3. Estimate cost and route for approval if the query is expensive.
4. Run the query and summarize the result in plain GTM language.

## gtm constraints and gotchas
- No DDL, destructive queries, or unbounded scans.
- Keep the answer tied to the original business question.
- Call out when the question cannot be answered reliably from available telemetry.
- Approval is for risk and cost, not just courtesy.

## expected outputs
- An approved query plan or executed analysis with SQL, cost note, and business summary.
