---
name: OpenGTM TDD Workflow
trigger: opengtm
max-iterations: 20
completion-promise: "ALL TESTS PASS AND MUTATION SCORE >= 80%"
---

Commands:
- tests: cd OpenGTM && npx vitest run
- mutation-tests: cd OpenGTM && npx stryker run
- typecheck: cd OpenGTM && npx tsc --noEmit
- build: cd OpenGTM && npm run build

Loop:
  run: tests
  until: "ALL TESTS PASS"
  then:
    - run: mutation-tests
    - until: "MUTATION SCORE >= 80%"
    - then:
        - run: typecheck
        - until: "No type errors"
        - then: build