---
name: OpenGTM TDD Workflow
trigger: opengtm
max-iterations: 20
completion-promise: "ALL TESTS PASS AND MUTATION SCORE >= 80%"
---

Commands:
- tests: npm test
- mutation-tests: npx stryker run
- typecheck: npm run typecheck
- build: npm run build

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
