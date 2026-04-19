## 2026-04-18 Known issues
- Pre-existing failing suite: `opengtm-crm/test/repo.test.ts` errors on `sqlite` import resolution. Do not treat this as a Wave 3 regression.
- Wave 3 skills files were written before verification. They typecheck at repo level, but lack dedicated tests.
- `packages/skills/src/registry-v2.ts` uses `require('node:fs')` inside ESM code; consider replacing with an ESM-safe file read path.
- `packages/skills/src/catalog.ts` currently returns manifests via `loadGtmSkillArtifacts()` without `contentPath`; SKILL.md artifact files still need to be created and wired.
- The ESM-unsafe loader in `packages/skills/src/registry-v2.ts` was replaced with `readFileSync` import; SKILL.md content-path wiring remains a follow-up task.
- Local LSP diagnostics could not run for this TypeScript package because `typescript-language-server` is not installed in the environment; repo `npm run typecheck` was used as the verification fallback.
- Wave 4.3 verification hit the same local LSP limitation; `typescript-language-server` is still unavailable, so clean `npm run typecheck` remains the practical verification fallback in this environment.
- Wave 5.2 loop tests initially could not resolve `@opengtm/memory` from Vitest because the workspace package was not linked in `node_modules/@opengtm`; running `npm install` refreshed workspace links and restored package-resolution parity with the other packages.
- Manual Node smoke checks against `packages/skills/src/index.ts` still fail before build because source exports use `.js` specifiers; use Vitest or a build-aware runner when verifying source-first packages directly.
