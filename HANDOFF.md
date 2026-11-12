# HANDOFF — Root Mirror (Canonical handoff lives in `docs/HANDOFF.md` & `docs/FULL_CONTEXT.md`)
Last synced: 2026-11-11T06:59:00+05:30

Please read [`docs/HANDOFF.md`](docs/HANDOFF.md) and [`docs/FULL_CONTEXT.md`](docs/FULL_CONTEXT.md) before doing anything.

## Quick Resume Summary
- **Strict Rule:** Zero `git` commands (`git`, `pnpm handoff` forbidden). Run `node`/`pnpm` with `BypassSandbox: true`.
- **Verified:** `pnpm -r build` clean · `pnpm -r test` **39/39 passed**.
- **Server status at 06:48 IST:** `:5173` (`web`) listening · `:8080` (`api`) **down** — restart `pnpm --filter api dev`.
- **Immediate Priority:** Verify real Chrome mic 2-way voice after Session 5 `ScriptProcessorNode` + `muteGain(0)` rewrite in `apps/web/src/audio/capture.ts` (not yet live-tested with human speech), fix any live mic/VAD/fallback issues, and complete the 1–2 min demo recording (`docs/DEMO_SCRIPT.md`) before **11:15 AM IST**.
