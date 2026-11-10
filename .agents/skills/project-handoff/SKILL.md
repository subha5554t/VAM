---
name: project-handoff
description: Use at the end of every task, before pausing, or before switching tool/model. Updates CONTEXT, TASKS, SESSION_LOG, DECISIONS, HANDOFF and commits so any other agent can resume with zero loss.
---
# project-handoff
1. Run `pnpm -r test`; record the result.
2. Rewrite `docs/CONTEXT.md` (status table, architecture snapshot, key facts, open questions, ONE next step).
3. Append to `docs/SESSION_LOG.md` (changes, commands+results, self-review, problems, next).
4. Update `docs/TASKS.md` (status + evidence). Add ADRs to `docs/DECISIONS.md` for non-trivial choices.
5. Run `pnpm handoff`; then write `docs/HANDOFF.md` incl. the RESUME PROMPT.
6. `git add -A && git commit -m "T<id>: <summary>"`. Never commit `.env`.
Report in ≤ 8 lines: what is done, what is not, what is risky, exact next step.

