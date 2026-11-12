# HANDOFF — overwrite at every stop/switch

**Updated:** 2026-11-11T23:40:00+05:30
**Last verified checks (ran AFTER the final code edit, Session 12 — turn-taking):**
- `pnpm -r build` → exit 0 (`packages/core`, `apps/api`, `apps/web`)
- `pnpm -r test` → **84/84 passed** (`@kam/core` 31, `apps/web` 45, `apps/api` 8)
- `pnpm e2e:browser` → **6/6 passed** (real Chrome + real Gemini Live, injected fake mic): complete greeting in 1 bubble, gate released with reason **`player-drained`**, VAD badge, seller transcript `"Hey, can you hear me?"`, and the reply was one short sentence that repeated the business question and called **no tool**. Capture log: `started at 48000Hz ... processing=browser-default`.
- `pnpm e2e:plan` → **7/7 passed**: `create_action_plan` called, 3 actions (₹18,078 / ₹26,345 / ₹18,570 per month) with owner + timeline
- `pnpm evals` → **5/5 sample scenarios** (no LLM judge; the full 24-scenario suite is still outstanding)
- `pnpm e2e:live:fast` → **4/4 passed** (last run Session 8; unchanged path)
- **Real microphone: the user confirms it works** (headset). **Turn-taking feel: still pending** — the code is built and the headless proof shows the right shape, but only a human voice proves that a 1 s pause is no longer cut.
**Deadline:** 11 Nov 2026, 11:15 AM IST
**Full history:** [`FULL_CONTEXT.md`](FULL_CONTEXT.md)

## Resume prompt (copy-paste this)

> Read `AGENTS.md`, `docs/CONTEXT.md`, `docs/TASKS.md`, `docs/DECISIONS.md` (ADR-010 → ADR-024) and `docs/HANDOFF.md`.
> **STRICT USER RULE: run no `git` command and do not run `pnpm handoff`.**
> **Another editor may be active in this repo** — re-read `apps/web/src/App.tsx`, `apps/web/src/live/LiveSession.ts`, `apps/web/src/audio/capture.ts` and `apps/web/src/components/CallStage.tsx` before editing; re-run `pnpm -r build` + `pnpm -r test` after any change.
> The headless voice loop, the 3-action plan and the mic are all proven. **The only unproven link is now the conversational feel: does Asha wait for the seller to finish?** Session 12 raised the server VAD silence window from 500 ms to 1000 ms, added turn-taking rules to the prompt, and made the greeting gate wait for the audio to drain before opening the mic. Your job is to prove it with a human voice, then record:
> 1. Ensure `:8080` and `:5173` are listening (`pnpm --filter api dev`, `pnpm --filter web dev`). **If `apps/api/src/server.ts` changed, restart the API** — the VAD config is baked into the ephemeral token and a pre-warmed token keeps the old window.
> 2. Run `pnpm e2e:live:fast` (must print **4/4**), then `pnpm e2e:browser` (**6/6**) and `pnpm e2e:plan` (**7/7**). If `e2e:browser` misses the greeting because Google's token mint took >20 s, retry once before investigating — this is an upstream-latency flake, not a capture regression.
> 3. Put on **headphones**. Open `http://localhost:5173` and **hard-refresh** (Ctrl+Shift+R) so the new bundle loads. Wait for **"Voice session ready"**, click **Start Voice Call**, allow the mic.
> 4. **Turn-taking check:** say one long sentence with a natural ~1 s pause in the middle. She must stay silent through the pause and answer only after the last clause. If she still answers at the pause, raise `LIVE_VAD_CONFIG.silenceDurationMs` to 1200 (or lower it to 900 if she feels sluggish). Only use `END_SENSITIVITY_LOW` if pauses are still cut — LOW can hang on room noise.
> 5. **Meta-question check:** say "can you hear me?". She must answer in ONE short sentence and repeat the business question — no tool call, no diagnosis.
> 6. **Barge-in check:** interrupt her mid-sentence; she must stop immediately.
> 7. Open DevTools Console. The capture line must read `started at 48000Hz` (or `44100Hz`) — **not 16000Hz**. If the bars stay flat, use the **System default** microphone dropdown or a headset; if the amber banner appears, click **Reconnect mic** (retries with AEC/NS/AGC off) or **Scan inputs**.
> 8. On success confirm: greeting plays to the end → badge flashes **"I can hear you"** as you speak → your words appear as a seller bubble → Asha answers → `AgentTrace` shows the tools → `BusinessVitals` shows ₹2,00,000→₹1,35,000 → **3 action cards** with ₹ impact → Download `.md` matches.
> 9. Then record the 1–2 min demo per `docs/DEMO_SCRIPT.md` and update the submission URLs (T22/T24).

## What was actually broken (root causes, proven)

| Symptom | Root cause | Fix |
|---|---|---|
| "now it listens but not perfectly" — greeting cut to `"Namaste Rajesh ji, main Asha hoon,"` | her own speaker output / room tone hit `START_OF_ACTIVITY_INTERRUPTS` during the opening turn | **greeting gate**: mic frames held until the audio drains, a deliberate barge-in *after her first audio chunk*, or a playback-aware watchdog (ADR-018, ADR-024) |
| **"I talk, then she answers — she does not listen properly"** (Session 12) | three separate causes: the VAD ended the seller's turn after **500 ms** of silence; the prompt had no turn-taking or meta-question rule, so "can you hear me?" launched the diagnosis; the gate released on `turnComplete` while her audio was still playing | `silenceDurationMs` 500 → **1000** (`LIVE_VAD_CONFIG`); a **TURN-TAKING** block in the prompt; the gate now waits for `player.onDrain` (`player-drained`) (ADR-024) |
| Seller heard late / transcript split | `turnCoverage: TURN_INCLUDES_ONLY_ACTIVITY` delayed input transcription; `prefixPaddingMs: 20` clipped onsets | `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO`, `prefixPaddingMs: 100` (ADR-019); A/B n=1, re-run n=3 before quoting |
| Empty pre-warm (`Unexpected end of JSON input`), slow proxy | `localhost` → `::1`, API bound IPv4-only `0.0.0.0` | proxy → `http://127.0.0.1:8080`; API listens on `::` with `0.0.0.0` fallback (ADR-021) |
| Action Plan card stayed empty | `create_action_plan` was only called in COMMIT (after agreement), and the prompt hardcoded ₹ figures that disagreed with the tool | prompt calls `create_action_plan` at RECOMMEND and speaks only its output; all prompt rupee figures deleted (ADR-020) |
| Orb stayed on "Asha is speaking" after she finished | nothing set the state back when the audio buffer drained | `AudioPlayer.onDrain` → `VoiceCore` returns to listening |
| Seller speaks but Asha never hears her; RMS flat, gate **open** | the capture `AudioContext` was forced to 16 kHz; the Intel Smart Sound array delivered all-zero samples at that rate | native-rate `AudioContext` + JS resample to 16 kHz; device picker; relaxed reconnect; mic-health banner; raw input scan (ADR-022, ADR-023). **The user now confirms the mic works.** |
| No proof the server hears the mic | `voiceActivity` messages were ignored | handled → on-screen **"I can hear you"** badge |
| Old banner lied about the cause | catch block replaced the real error | real reason shown (Session 8) |

## Gotchas & hard-won lessons (do not re-learn these)
- **Never gate the mic with a fixed timer.** ADR-018 exists because a 12 s timer expired before a slow first turn. The watchdog must reset on every audio chunk and wait for `player.isPlaying()` to go false.
- **A `turnComplete` is not "playback finished".** The server can finish generating before her audio has played. Releasing the gate on `turnComplete` opens the mic while she is still talking — that is how her trailing words became a bogus seller turn. Release on the player's drain (ADR-024).
- **A 500 ms silence window is too short for Hinglish.** Google recommends 500–800 ms for responsiveness, but it cut the seller's natural pauses mid-sentence. 1000 ms is a deliberate trade-off: ~0.5 s more latency per turn for a turn that is not cut off. Tune within 900–1200 ms; do not drop below 900.
- **"Can you hear me?" is not a business answer.** Without a prompt rule the model treats it as the answer to the diagnosis question and starts calling tools. The prompt now says so explicitly.
- **A VAD change is server-side only.** `LIVE_VAD_CONFIG` in `apps/api/src/server.ts` is baked into the ephemeral token; the browser's `setup` message cannot override it. Restart the API and hard-refresh the browser, or you keep testing the old window.
- **You cannot barge in before the first audio chunk.** Releasing the gate on loud frames before Asha is audible lets room noise truncate the greeting.
- **The server token is authoritative.** All session config (`turnCoverage`, `prefixPaddingMs`, tools, prompt) lives in `apps/api/src/server.ts`. Editing `LiveSession.ts` cannot change it.
- **`mediaChunks` is dead.** Any code reintroducing it makes Asha deaf. `LiveSession.test.ts` guards this.
- **`BusinessVitals`/`LossBridge` render only tool output** — a populated dashboard is NOT proof the tools ran. Check `AgentTrace` and the tool events. The baseline is fetched via the real tool endpoints; do not hardcode KPIs.
- **Never force `sampleRate: 16000` on the capture `AudioContext`.** Use the device's native rate and the existing `downsampleTo16k`. The forced rate produced silence on the seller's Intel array (ADR-022).
- **Do not auto-restart the microphone in a loop.** It can disturb the synthetic E2E stream and surprise the seller. Use the device picker / **Reconnect mic** explicit actions.
- **A saved `deviceId` can disappear between calls.** The exact constraint is wrapped with a fallback to the system default; keep that fallback.
- **The `ScriptProcessorNode` deprecation warning is not the bug.** Audio capture works; migrating to AudioWorklet was previously abandoned after a silent-output bug (ADR-006/008).
- **Node 20.20.2 has no global `WebSocket`.** Use `pnpm e2e:*` (they pass `--experimental-websocket`).
- **Do not add rupee amounts to the prompt.** The model copies them verbatim and then contradicts the tool output.
- **Chrome's `--use-file-for-fake-audio-capture` loops immediately** — it talks over the greeting. `browser-e2e.mjs` injects a controllable `MediaStreamDestination` instead.
- **`thinkingConfig.thinkingBudget: 0` is rejected** by `gemini-3.5-flash-lite` (`INVALID_ARGUMENT`).
- **Model IDs come from `.env`** (`gemini-3.8-live`, `gemini-3.5-flash-lite`, `VOICE_NAME=Aoede`). Never hardcode new ones.

## Known gaps (honest list)
1. **The turn-taking feel is not yet proven with a human voice.** The code is built and the headless proof shows the right shape (no tool call on "can you hear me?", the gate drains before the mic opens), but only a human can confirm that a 1 s pause is no longer cut.
2. **`interimInputTranscription` is ignored**, so the seller's words appear only as a final bubble. A late seller bubble is not proof that Asha did not hear them — it is just the transcription timing.
3. **Greeting latency depends on Google** — `setupComplete` measured 2.6–12 s across runs and the same E2E saw the greeting at 3.5 s in one run and 20.3 s in another. The gate and the readiness chip tolerate it, but the first seconds of a recording can feel slow.
4. **Output transcript script flips** between Devanagari and Latin Hinglish. Audio is correct; only on-screen text varies. Fixing it needs a prompt line ("write Hinglish in Roman script") — not done.
5. **`create_action_plan` is model-driven** — verified four times, but non-deterministic. If the card is empty, check the Activity Feed before changing code.
6. **Fallback mode is slow** (~12 s per LLM hop with `gemini-3.5-flash-lite`). Prefer Live in the demo.
7. **Evals (T19)** still cover 5/24 scenarios with no LLM judge (the 5 sample scenarios pass).
8. **The scan threshold is loose** — `MIC_SIGNAL_THRESHOLD = 0.001` accepts ~0.002 noise, so the scan can prefer `communications` over a real headset. Latent, not the current blocker.
9. **Docs drift:** `README.md` and `docs/NOTE_1PAGE.md` still mention `AudioWorklet`; the code uses `ScriptProcessorNode`.
10. **Deploy (T22) not done.** Nothing is committed (user forbade git).

## Files most likely to need attention next
- `apps/api/src/server.ts` — `LIVE_VAD_CONFIG` (the 1000 ms silence window), locked live config (`turnCoverage`, padding), dual-stack listen, token mint
- `packages/core/src/prompt.ts` — the TURN-TAKING block, 7-stage workflow, tool-first recommendation
- `apps/web/src/live/LiveSession.ts` — greeting gate (drain-based release), watchdog, VAD forwarding, barge-in
- `apps/web/vite.config.ts` — proxy target must stay `127.0.0.1`
- `scripts/browser-e2e.mjs` — real-browser voice proof (6 checks; benign gate reasons include `player-drained`)
- `scripts/action-plan-e2e.mjs` — 3-action workflow proof (7 checks)
