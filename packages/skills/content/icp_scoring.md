## purpose
Apply the workspace's ideal customer profile rules consistently so routing and prioritization stay aligned with strategy.

## when to use
Use when a lead or account is created, enriched, or materially updated.

## operator steps
1. Load the active ICP rule set and required fields.
2. Evaluate firmographic, technographic, persona, and behavior matches.
3. Record which rules matched and which key data is missing.
4. Write the final score back to the system of record.

## gtm constraints and gotchas
- Do not freehand exceptions outside the declared rules.
- Missing data should reduce confidence, not silently become a miss.
- Scores need to be reproducible from the same inputs.
- Keep rule-match detail available for audit and seller trust.

## expected outputs
- A deterministic ICP score with matched-rule evidence and confidence notes.
