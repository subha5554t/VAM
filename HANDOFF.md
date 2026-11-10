# HANDOFF — overwrite at every stop/switch

**Written by:** Gemini 3.8 Flash at 2026-11-10T18:30:00+05:30
**Last completed task:** T00 — Scaffold monorepo + guard files
**Currently in progress (if any):** None (T00 100% complete, tests green, ready for T01)
**Tests:** 3/3 passed (packages/core, apps/api, apps/web) · **Evals:** not started yet

## What the next agent must do first
1. Read `AGENTS.md`, `docs/CONTEXT.md`, this file, then `docs/TASKS.md`.
2. Run `pnpm -r test` and verify that all 3 packages pass.
3. Continue with: **T01 — Verify Gemini Live API with official example / Node test script using the provided GEMINI_API_KEY**.

## Gotchas (things that wasted time)
- On Windows with nvm, `node` and `pnpm` reside under symlinked junction `C:\nvm4w\nodejs`. Commands must be executed outside the sandbox or using standard shell PATH.
- `@google/genai` npm package is currently on version `^3.0.0` (not `0.1.2`).

## Do NOT redo / do NOT change
- Do NOT delete or recreate `pnpm-workspace.yaml` or workspace configurations.
- Do NOT commit `.env`.

## RESUME PROMPT (paste into the new tool)
> You are continuing an in-progress project. Read AGENTS.md, docs/CONTEXT.md, docs/HANDOFF.md, docs/TASKS.md. Run `pnpm -r test` and tell me the state in 5 lines. Challenge anything in the plan or last session's work that looks wrong or unverified. Then continue with T01: verify Live API connection, model ID, voices, transcripts and toy tool call using @google/genai. Follow the Be-Critical and Context protocols in AGENTS.md; update the context files and commit after the task.
