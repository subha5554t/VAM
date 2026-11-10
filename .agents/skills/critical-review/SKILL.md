---
name: critical-review
description: Adversarial self-review or independent review of a diff/task against docs/REVIEW_CHECKLIST.md. Use after finishing each task and before commits; also when asked to review another agent's work.
---
# critical-review
Role: skeptical senior reviewer. Assume the work is wrong until proven otherwise.
1. Read the task's acceptance criteria and `docs/REVIEW_CHECKLIST.md`.
2. Inspect the diff (`git diff HEAD~1` or staged) and run `pnpm -r test`.
3. Produce: (a) BLOCKERS (must fix), (b) RISKS for the live demo ranked by likelihood × impact, (c) missing tests, (d) claims you could not verify, (e) simplifications that reduce risk.
4. For voice/prompt work, run `pnpm evals` and quote failing scenario ids.
5. Never approve without evidence. Do not rewrite code unless asked — report first.

