# CONTEXT — living project state. Last updated: 2026-11-11T23:35:00+05:30 by OpenCode (MiniMax M3.1 Flash)

## 1. Goal & deadline
Voice-first Snapdeal Virtual KAM ("Asha") web application for sellers whose sales dropped.
- **Hard deadline:** **11 Nov 2026, 11:15 AM IST**.
- **Deliverables:** working voice demo, 1–2 min screen recording (`docs/DEMO_SCRIPT.md`), 1-page note (`docs/NOTE_1PAGE.md`), repo.
- **Rule override (USER STRICT):** **DO NOT run any `git` command** (`git add/commit/status/diff`) and **do not run `pnpm handoff`** (it invokes git).

## 2. Status snapshot (post Session 12 — "let the seller finish: turn-taking")
| Area | State | Evidence / Current Reality |
|---|---|---|
| **UI refresh** | **done** | Ivory shell + ink stage. New `Header`, `CallStage`, `VoiceCore`, dark `Transcript`, `StageTracker`, `BusinessVitals` + `LossBridge`, `ActionPlanCard`, `AgentTrace`, `AssumptionsDrawer`. `Orb.tsx`, `Cockpit.tsx`, `ActivityFeed.tsx` removed. |
| **Headless voice loop** | **verified** | `pnpm e2e:browser`: real Chrome + real Gemini Live + injected fake mic. **6/6** after the Session 12 turn-taking changes. Greeting gate reason is now `player-drained`; seller transcript + contextual reply + VAD badge. |
| **Turn-taking / listening** | **code done, human feel-check pending** | Three causes fixed in Session 12: (a) VAD silence window 500→**1000 ms** (`LIVE_VAD_CONFIG`, server-side in the ephemeral token); (b) new **TURN-TAKING** block in the prompt (wait through pauses, connectivity checks are not business answers, no tools before a real cause, one filler then both diagnostic tools); (c) the greeting gate now waits for `player.onDrain` instead of releasing on `turnComplete`. Proof: to the seller clip "Hey, can you hear me?" Asha replies in **one** short sentence, repeats the business question and calls **no** tool (before: filler → 2 tools → findings). |
| **Real-microphone input** | **confirmed by the user** | The user reports the mic works from the product side, so the raw-input scan (ADR-023) resolved the hardware blocker. Remaining question is conversational quality, not signal. |
| **Action Plan workflow** | **verified** | `pnpm e2e:plan`: 7/7 after the prompt change. Greeting → seller answer → `get_seller_snapshot`, `analyze_sales_decline`, `advance_stage(recommend)`, `create_action_plan`; 3 actions, ₹18,078 / ₹26,345 / ₹18,570/mo, owner + timeline. |
| **Numbers grounding** | **done** | Rupee figures removed from `packages/core/src/prompt.ts`; `create_action_plan` derives them from `recommend(seller)`. `get_seller_snapshot` now also returns structured `impressions` used by the dashboard (never hardcoded in React). |
| **Core / API / Web tests** | **done** | **84/84**: core 31, api 8, web 45 (adds turn-taking prompt assertions, the VAD config guard, and the drain-gate test). |
| **Build** | **done** | `pnpm -r build` exit 0 (web 258.48 kB JS / 30.70 kB CSS). |
| **Evals harness (T19)** | doing | 5/24 scenarios, no LLM judge. `pnpm evals` re-run after the prompt change: **5/5 sample scenarios pass**. |
| **Deploy (T22)** | todo | Not deployed. |

## 3. Architecture snapshot
- **Primary Voice (Live S2S):** Browser (`:5173`) → `POST /api/session` (`:8080`) → server runs `get_seller_snapshot` + `analyze_sales_decline`, embeds the output as `VERIFIED FACTS`, returns `toolEvents`, mints an ephemeral token locking **all** session config (`responseModalities`, `systemInstruction`, `tools`, both transcriptions, `speechConfig`, `realtimeInputConfig`, `sessionResumption`, `contextWindowCompression`).
  Browser opens `wss://.../v1beta.GenerativeService.BidiGenerateContentConstrained`, sends `{setup:{model}}`, waits `setupComplete`, starts `AudioCapture` **in parallel**, triggers the greeting, streams `realtimeInput.audio` (16 kHz PCM), receives 24 kHz PCM + transcripts + `voiceActivity` + `toolCall` → `POST /api/tools/:name` → `toolResponse`.
- **Fallback (Compatibility):** Web Speech `SpeechRecognition` → `POST /api/chat` (tool loop, `thoughtSignature` preserved) → `speechSynthesis`.
- **Capture (Session 10–11):**
  - `AudioContext` uses the **device's native rate** (usually 48 kHz, sometimes 44.1 kHz); `downsampleTo16k` box-filter resamples to 16 kHz Int16 PCM. Do **not** reintroduce `{ sampleRate: 16000 }` — on some Windows Intel Smart Sound arrays it produced all-zero samples.
  - Default mode sends **only** the exact `deviceId` (or `{}` for system default): no `channelCount`, no explicit AEC/NS/AGC flags. Some Windows APO/driver combinations return zeros when any of those constraints are present, even `false`.
  - `relaxed` mode sends only `echoCancellation:false, noiseSuppression:false, autoGainControl:false` (plus `deviceId`); used by "Reconnect mic" and by the scan's second attempt per device.
  - **Raw input scan** (`probeInputs` → `pickBestInput` in `capture.ts`): opens the system default plus every enumerated `audioinput` outside the ScriptProcessor graph, measures peak amplitude with an `AnalyserNode` for ~1.2 s, retries each silent device with processing off, and returns the loudest. `App.handleScanMics()` stops capture, runs the scan, switches to the winner, and restores the old device if none carries signal. UI: **Scan inputs** in the amber health banner; stops capture for a few seconds.
  - Diagnostics expose `rms`, `sampleRate`, `deviceLabel`, `deviceId`, `trackState`, `trackMuted`, `isCapturing`; `LiveSession` adds `gateOpen` and cumulative `framesSent`. Startup logs `Track settings` + `capabilities`.
  - `ScriptProcessorNode` (buffer 1024) remains the capture node; Chrome logs a deprecation warning, it is not fatal.
- **Greeting gate:** mic frames held while Asha delivers her opening turn. `turnComplete` only **marks** the turn finished (`greetingTurnCompleted`); the gate is released when the player's queue actually drains (`player-drained`), on a deliberate barge-in (4 frames > 0.34, only after her first audio chunk), by the playback-aware watchdog (15 s to first audio, then 6 s after the last chunk), or by the **30 s hard timeout** (flushes the player and forces the mic open).
- **Endpointing (server-side, locked into the ephemeral token):** `LIVE_VAD_CONFIG` in `apps/api/src/server.ts` — `silenceDurationMs: 1000` (was 500; 500 cut normal Hinglish pauses mid-sentence), `END_SENSITIVITY_HIGH`, `START_SENSITIVITY_HIGH`, `prefixPaddingMs: 100`, `activityHandling: START_OF_ACTIVITY_INTERRUPTS`, `turnCoverage: TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO`. Editing it requires an **API restart** (the config is baked into the token), and the browser must hard-refresh so it picks up a freshly minted token.
- **Turn-taking in the prompt:** `packages/core/src/prompt.ts` has a dedicated `TURN-TAKING` block — wait through pauses, never fill silence, one speaker at a time, greetings/connectivity checks ("can you hear me?") are not business answers (answer in one sentence, repeat the question, no tools, no workflow advance), a short "haan"/"nahi" that answers the business question is valid, and DIAGNOSE starts only after a real business cause (one filler → `get_seller_snapshot` + `analyze_sales_decline` → speak, with no speech between the tool calls).
- **Voice UI states:** `VoiceCore` shows Ready / Connecting / Listening / Thinking / Speaking. The dark `Transcript` includes the seller bubble, "I can hear you" VAD badge and a debug text box. `CallStage` exposes the microphone device select, live RMS bars and the amber mic-health banner.
- **Dashboard:** `App` fetches `get_seller_snapshot` + `analyze_sales_decline` on mount into `baselineKpis` / `baselineDiagnosis`; the live tool events replace them. `BusinessVitals` + `LossBridge` render only tool-derived numbers.
- **Proxy/API:** Vite proxies `/api` to **`http://127.0.0.1:8080`**; API listens on **`::`** with a `0.0.0.0` fallback.

## 4. Key verified facts & `.env`
- Windows, Node `v20.20.2`, pnpm `8.15.1`, `@google/genai ^3.0.0`, Vite `5.4.21`, Fastify `^4.27.0`.
- `.env`: `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL=gemini-3.8-live`, `GEMINI_TEXT_MODEL=gemini-3.5-flash-lite`, `VOICE_NAME=Aoede`, `ALLOWED_ORIGINS`, `PORT=8080`.
- **Last verified (11 Nov 2026 ~23:30 IST, Session 12 — after the turn-taking changes):**
  - `pnpm -r build` → exit 0 (web 258.48 kB JS / 30.70 kB CSS).
  - `pnpm -r test` → **84/84** (core 31, api 8, web 45).
  - `pnpm e2e:browser` → **6/6**. Greeting 1 bubble; gate released with reason **`player-drained`**; VAD badge active; seller transcript `"Hey, can you hear me?"`; reply = `"Ji, main aapko sun sakti hoon. Kya stock out hone ki wajah se dispatch ruk gaya hai?"` — one short sentence, **no tool call**, business question repeated (the old behaviour was filler → 2 tools → findings).
  - `pnpm e2e:plan` → **7/7** after the prompt change: `get_seller_snapshot` → `analyze_sales_decline` → `advance_stage` → `advance_stage` → `create_action_plan`; 3 actions with grounded ₹ and owner + timeline.
  - `pnpm evals` → **5/5** sample scenarios (no LLM judge; the full 24-scenario suite is still outstanding).
  - Browser console: `Mic "MediaStreamAudioDestinationNode" started at 48000Hz (resampling to 16kHz Int16 PCM, processing=browser-default)` + `[AudioCapture] Track settings`.
  - Both `:5173` (Vite, `::1`) and `:8080` (API, `::`) listening; IPv4 and IPv6 direct `/healthz` both 200.

## 5. Known issues & open questions
1. **Turn-taking still needs one human pass.** The code change is built and the headless proof shows the right shape (no tool call on a connectivity check, gate drains before the mic opens), but only a real voice proves the *feel* — whether a 1 s pause is still cut short. Tune `silenceDurationMs` within 900–1200 ms; only use `END_SENSITIVITY_LOW` if pauses are still truncated (LOW can hang on room noise). See §7.
2. **A 1000 ms silence window adds latency** — the seller's reply now starts ~1 s after they stop talking instead of ~0.5 s. That is the deliberate trade-off; do not lower it below 900 ms without hearing the cut-off.
3. **A VAD change needs an API restart + hard refresh.** The config is baked into the ephemeral token, and the browser pre-warms a token on page load — a stale token keeps the old 500 ms window.
4. **Capture device selection is browser-level only.** In fallback mode the Web Speech API uses the browser default; the new device select is shown only in Live mode.
5. **Mic-health banner is heuristic.** "No mic input" requires ~6 s of flat RMS after the gate opens; "Asha is not detecting speech" requires local audio newer than server VAD by 12 s. "Microphone muted by Windows" comes from `MediaStreamTrack.muted`, which can be transient. It is a hint, not a measurement.
6. **Scan inputs stops capture for a few seconds** while it probes every device (up to ~1.2 s × 2 modes × devices). Speak during the scan; the UI says so. It restores the previous device if nothing carries signal.
7. **The scan threshold is loose.** `MIC_SIGNAL_THRESHOLD = 0.001` accepts ~0.002 noise and can pick `communications` over a real headset. Latent, not the current blocker.
8. **Greeting/token latency varies with Google** — token mint 0.8 s to 35 s observed, `setupComplete` 2.6–12 s. The gate tolerates it; the readiness chip and hard timeout bound the failure.
9. **Barge-in on laptop speakers.** Use headphones; speaker echo can trigger the local gate.
10. **`create_action_plan` is model-driven.** Verified 4× (7/7) but non-deterministic. If the card is empty, check `AgentTrace`/tool events before changing code.
11. **Transcript script is mixed** — Asha's output transcription flips Devanagari/Latin Hinglish. Audio is correct.
12. **Fallback latency ≈ 12 s per LLM hop** (`gemini-3.5-flash-lite`). Live is ~1–2 s/turn.
13. **`thinkingConfig.thinkingBudget: 0` is rejected** by `gemini-3.5-flash-lite` — do not re-add.
14. **`ScriptProcessorNode` is deprecated** (console warning) but working. Migrating to AudioWorklet is optional and was previously abandoned after a silent-output bug (ADR-006/008).
15. **Evals (T19)** still 5/24, no judge (the 5 sample scenarios pass).
16. **Deploy not done.** All changes are uncommitted working-tree edits (user forbade git).

## 6. How to run & verify
1. `pnpm --filter api dev` (`:8080`) · `pnpm --filter web dev` (`:5173`). **Restart the API after any `apps/api/src/server.ts` edit** — the VAD config is baked into the ephemeral token.
2. `pnpm -r test` (84/84) · `pnpm -r build`.
3. `pnpm e2e:live:fast` (no mic, ~30 s — run before recording).
4. `pnpm e2e:browser` (headless Chrome + injected fake mic, ~40–100 s) — proves greeting, VAD, seller transcript, reply. It can flake on a slow upstream token mint; retry once before investigating.
5. `pnpm e2e:plan` (~60 s) — proves the 3-action plan is created with tool-derived ₹.
6. `pnpm evals` (~30 s) — 5 sample scenarios, no judge.

## 7. NEXT STEP
1. Human: **hard-refresh** `http://localhost:5173` (Ctrl+Shift+R) so the new bundle loads, and confirm the API was restarted so a fresh token carries the 1000 ms window. Put on **headphones**, start a Live call, allow the mic, and speak.
2. **Turn-taking check (the thing to verify now):** say one long sentence with a natural ~1 s pause in the middle ("Mere orders **drop ho gaye hain** … [pause] … **kyunki stock khatam ho gaya**"). Asha must stay silent through the pause and answer only after the last clause. If she still answers at the pause, raise `silenceDurationMs` to 1200 (or 900 if she feels sluggish).
3. **Meta-question check:** say "can you hear me?" / "hello". She must answer in ONE short sentence and repeat her business question — she must **not** call tools and must not start the diagnosis.
4. **Barge-in check:** interrupt her mid-sentence. She must stop talking immediately and listen to you.
5. **Post-answer check:** answer her question ("haan, stock out ho gaya"). She may then call the two diagnostic tools, but must speak once with the findings — no filler → tool → filler → tool → findings chain.
6. If the bars stay flat: when the amber banner appears, click **Scan inputs** and keep speaking. It tests the system default + every enumerated input (browser defaults first, then AEC/NS/AGC off) and switches to the input with actual signal. You can also pick **System default** or a headset manually, or click **Reconnect mic** (processing off).
7. If the scan reports **"No signal on any input"**, the app is receiving zeros from every device — check the laptop mute key, Windows Settings → Privacy → Microphone (both toggles), Sound → Input volume, and try a headset/USB mic or Edge. Fully quit and reopen Chrome after changing Windows privacy.
8. Once the real-mic turn-taking pass succeeds, record the 1–2 min demo (`docs/DEMO_SCRIPT.md`), then update `README.md`/submission with the live URL (T22/T24).
