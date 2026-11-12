# Issue Audit & Complete Fix Plan — Snapdeal Voice KAM ("Asha")

> **Scope:** Diagnosis verified directly against the running app (`http://localhost:5173` + `http://localhost:8080`) using headless Microsoft Edge (CDP) and live 16 kHz spoken-audio WebSocket probes against `gemini-3.8-live`. **No source files were modified.**

---

## 1. Confirmed Root Causes (Observed Evidence, Not Guesses)

### Issue 1 — "When I tell something, Asha does not listen" (CRITICAL)
- **Browser + Live Speech Probe Evidence:**
  - In Edge CDP (`Start Voice Call`), 245 microphone frames streamed out over WebSocket as `realtimeInput.mediaChunks`, yet Gemini returned zero user transcripts or replies.
  - Streaming **7.31 seconds** of real 16 kHz mono PCM speech (*"Namaste Asha, my sales dropped by 32% this month. Why did my orders fall?"*) using the app's exact payload (`realtimeInput.mediaChunks`, both with and without the greeting) produced **`ACTIVITY_START`: none, `inputTranscription`: `""`, `tools`: `[]`, `turns`: `0`**.
  - Streaming the **exact same 7.31s speech audio** with only ONE change (`realtimeInput.mediaChunks` → **`realtimeInput.audio`**) immediately triggered:
    - `voiceActivity: ACTIVITY_START` (`0.240s`) → `ACTIVITY_END` (`7.600s`)
    - `inputTranscription`: `"Namaste Asha, my sales dropped by 32% this month. Why did my orders fall?"`
    - `toolCall`: `["advance_stage"]`, `["get_seller_snapshot"]`
    - `outputTranscription` + **19 PCM audio chunks**.
- **Exact Cause in Code:**
  - [LiveSession.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/live/LiveSession.ts#L106-L119) sends deprecated `realtimeInput.mediaChunks` instead of `realtimeInput.audio` (`mimeType: 'audio/pcm;rate=16000'`), which `gemini-3.8-live` on `BidiGenerateContentConstrained` ignores.
  - Secondary visibility gap: [capture.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/audio/capture.ts#L84-L92) computes volume (`rms * 6`) only for barge-in and never displays a live mic RMS meter or active device/track status in the UI, and [capture.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/audio/capture.ts#L16-L26) uses nearest-neighbor `Math.round(i * ratio)` downsampling if the browser refuses 16 kHz.

### Issue 2 — "No talk some time" / Audio Cuts Out Mid-Sentence (CRITICAL)
- **Browser + Probe Evidence:**
  - In Edge CDP, `[LiveSession] Local barge-in triggered by user voice! Flushing player.` fired **4 times** (`dt = 18.99s, 19.12s, 21.55s, 49.06s`) right while Gemini's greeting/response audio was streaming and playing.
  - Probe 2 also showed Gemini emitting `modelTurn` + `turnComplete #1` (*"Let me check your account numbers..."*) **before** emitting `toolCall: ["get_seller_snapshot"]`.
- **Exact Causes in Code:**
  1. **Hair-trigger client barge-in:** [capture.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/audio/capture.ts#L89-L90) scales `rms * 6`, and [LiveSession.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/live/LiveSession.ts#L120-L127) calls `this.player.flush()` on a single frame whenever `volume > 0.05` — i.e., **raw RMS > `0.0083`**. Normal laptop fan noise, keystrokes, or Asha's own speaker leaking into the mic wipes out [AudioPlayer](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/audio/player.ts#L88-L101) mid-sentence.
  2. **In-flight chunk race after local flush:** Local `flush()` does not discard/gate subsequent in-flight chunks from the same interrupted turn, nor does it notify the server, so playback either goes silent or stutters cleanly out of sync with `state`.
  3. **Premature UI state switch during tool calls:** [LiveSession.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/live/LiveSession.ts#L186-L192) switches state to `'listening'` 300ms after `turnComplete` even when Gemini immediately follows up with a `toolCall` turn.
  4. **Broken `reconnect()` + Missing Token Config:** [LiveSession.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/live/LiveSession.ts#L275-L281) calls `this.start()` with no arguments (dropping user's `language` and `mode`), and [server.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/api/src/server.ts#L92-L99) omits `inputAudioTranscription`, `outputAudioTranscription`, `speechConfig` (`.env` `VOICE_NAME=Aoede` is unused), `realtimeInputConfig`, `sessionResumption`, and `contextWindowCompression`.

### Issue 3 — "Take time to talk" (~15s–24s Startup Latency) (HIGH)
- **Measured Browser & Server Timings:**
  - Your `apps/api` log: `POST /api/session` = **7,519 ms**; `POST /api/tools/advance_stage` completed at **+15.54s**.
  - Edge CDP trace (`dt` from clicking `Start Voice Call`):
    1. `POST /api/session`: **8,585 ms** (`55ms → 8,640ms`)
    2. WebSocket TCP/TLS/upgrade (`ws.onopen`): **3,338 ms** (`8,645ms → 11,983ms`)
    3. Setup handshake (`setup` → `setupComplete`): **4,446 ms** (`11,984ms → 16,430ms`)
    4. Mic init blocking greeting (`await this.capture.start`): **624 ms** (`16,431ms → 17,055ms`)
    5. Greeting first audio byte: **+1,966 ms** (`dt = 19.02s`), then blocked by a redundant `advance_stage('discover')` tool round-trip until **24.81s**!
- **Exact Causes in Code:**
  - Token minting only starts when the user clicks `Start Voice Call`, paying cold auth/network latency synchronously (`server.ts:86-101` constructs a fresh `GoogleGenAI` instance per call).
  - `await this.capture.start(...)` runs sequentially **before** sending the greeting `clientContent` trigger (`LiveSession.ts:102-155`).
  - Prompt Step 1 instructs Gemini `"Advance stage to 'discover'"` (`prompt.ts:54`), forcing an extra tool round-trip even though [useCallStore.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/store/useCallStore.ts#L67) already initializes `conversationStage` to `'discover'`.

### Issue 4 — "Also she ask not usefull quistion" (HIGH — UX / Rubric Impact)
- **Observed Output (`07:06:27 am` screenshot & Edge CDP):**
  - Asha opens with: `"Namaste Rajesh ji, main Asha hoon, aapki Snapdeal Virtual KAM. Aaj main aapki kya madad kar sakti hoon?"`
  - Transcript artifacts observed:
    - Model control string `<no speech>{pause}` leaked verbatim into `outputTranscription` in Probe 3.
    - [useCallStore.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/store/useCallStore.ts#L93-L99) joins streaming `bot` chunks with `' '` (`lastMsg.text + ' ' + text`), creating double spaces (`"Namaste Rajesh ji,  I am Asha..."`) and merging back-to-back bot turns into one bubble.
- **Exact Causes in Code:**
  - [LiveSession.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/live/LiveSession.ts#L136-L140) hardcodes `"ask how you can help today"` in reactive mode even when calling a seller whose monthly sales just fell **32.5% (₹2,00,000 → ₹1,35,000)** on the dashboard right in front of them.
  - [prompt.ts](file:///c:/Users/VICTUS/Downloads/VAM/packages/core/src/prompt.ts#L30-L33) repeats that passive greeting and still treats stage 1 (`GREET` + `advance_stage('discover')`) + stage 2 (`get_seller_snapshot` → `analyze_sales_decline`) + up to 3 questions sequentially before delivering business insights. Note [scenarios.json](file:///c:/Users/VICTUS/Downloads/VAM/data/scenarios.json#L16) T01 also expects `"greets and asks how it can help"`, so prompt and eval expectation must be aligned together.

### Issue 5 — Additional Verified Gaps Found in Browser & Code Inspection
1. **Mute button is fake in Live S2S mode:** Edge CDP proved `mediaChunks` kept streaming (`138 → 150` chunks) after clicking Mute because [App.tsx](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/App.tsx#L245-L256) only toggles UI `isMuted` state and never mutes `AudioCapture` / `LiveSession`.
2. **Compatibility mode never executes tools or pulls numbers:** Confirmed in Edge CDP and direct `POST /api/chat` probe — sending `"Meri sales 32% kyun giri? Action plan batao."` took **8,089 ms** and replied only `"Let me check your catalogue numbers right away..."` with `toolsCalled: []` and `actionPlanEmpty: true` because [server.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/api/src/server.ts#L162-L165) calls `ai.models.generateContent` **without `tools`**. Also:
   - [App.tsx](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/App.tsx#L88-L155) keeps `const recognition` local in `handleStartFallback` (never stopped in `handleEndCall`), and `recognition.onresult` sends only 1 turn (`messages: [{ role: 'user', text: transcript }]`), losing full history.
3. **Scroll/Viewport Overflow:** On Edge `1280×800` (`innerHeight: 660`, `scrollHeight: 954`), the debug text box at the bottom of `Transcript` and bottom of `Agent Activity Feed` sit below the fold without scrolling.
4. **Hardcoded Summary Export & Incomplete Evals:** [ActionPlanCard.tsx](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/components/ActionPlanCard.tsx#L11-L52) hardcodes the ₹1,35,000 / 3-action markdown export string instead of building dynamically from tool results (`plan`, `kpis`), and [evals.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/api/src/evals.ts#L32-L79) / [run-evals.mjs](file:///c:/Users/VICTUS/Downloads/VAM/evals/run-evals.mjs#L47-L68) run only 5/24 scenarios without tool declarations or an automated grader.

---

## 2. Step-by-Step Fix Plan

### Phase 1 — Verify Live API Spec & Fix Core Audio Protocol (`apps/api` + `apps/web`)
1. **Verify `@google/genai` Live API contract (`live-api-verify`):**
   - Inspect installed `@google/genai@3.0.0` `ai.live.connect` vs raw WebSocket (`v1alpha` vs `v1beta` `BidiGenerateContentConstrained`, as `@google/genai` emits ephemeral token setup cleanly and logs `v1alpha` guidance).
2. **Switch audio stream payload from `mediaChunks` to `realtimeInput.audio`:**
   - Update [LiveSession.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/live/LiveSession.ts#L106-L119) (either via `ai.live.connect` `session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } })` or fixed WS `{ realtimeInput: { audio: ... } }`) and send `{ realtimeInput: { audioStreamEnd: true } }` when mic is muted/stopped.
3. **Complete Ephemeral Token `liveConnectConstraints` in [server.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/api/src/server.ts#L86-L108):**
   - Pass explicit `inputAudioTranscription: {}`, `outputAudioTranscription: {}`, `speechConfig` (`voiceName: process.env.VOICE_NAME || 'Aoede'`), `realtimeInputConfig` (`automaticActivityDetection` sensitivity/silence tuning), `sessionResumption: {}`, and `contextWindowCompression` (sliding window).

### Phase 2 — Fix Audio Capture Quality, Barge-In, Mute, Reconnect & Latency
1. **Fix Barge-In & Playback Race ([capture.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/audio/capture.ts), [LiveSession.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/live/LiveSession.ts)):**
   - Remove the hair-trigger single-frame `volume > 0.05` (`raw RMS > 0.0083`) client flush that cuts off Asha mid-sentence. Rely primarily on Gemini server-side `serverContent.interrupted` (which becomes active once `realtimeInput.audio` is used!), optionally backed by a calibrated sustained-speech local gate (e.g., 3+ consecutive frames above a realistic speech RMS threshold) + turn-generation ID so stale in-flight chunks from a flushed turn never play.
   - Replace nearest-neighbor downsampling in `downsampleTo16k` with linear interpolation and expose a clean live mic RMS meter + active `MediaStreamTrack` status badge in the UI (`Orb` / mic bar) so hardware-muted/wrong-mic issues are immediately obvious.
2. **Cut Call-Start Latency from ~15–24s down to < ~4–6s:**
   - Reuse a module-level warm `GoogleGenAI` client / HTTP keep-alive in [server.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/api/src/server.ts) and optionally pre-warm / prefetch a single ephemeral token on page load or language/mode selection (with expiry tracking & clean fallback on click, respecting `uses: 1`).
   - Run `capture.start()` in parallel with WebSocket open / setup instead of blocking the greeting trigger on `await capture.start()`.
   - Remove the redundant `advance_stage('discover')` call during turn 1 (already the starting stage), so Asha speaks immediately on connection without waiting an extra tool round-trip.
3. **Fix Mute, Reconnect & Transcript Formatting:**
   - Wire [App.tsx](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/App.tsx#L245-L256) Mute button directly into `liveSessionRef.current?.setMuted(...)` so mic audio frames stop sending to Gemini (`audioStreamEnd: true`) while muted.
   - Save `{ language, mode }` in `LiveSession` so `reconnect()` preserves selected language/proactive mode.
   - Clean up [useCallStore.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/store/useCallStore.ts#L89-L113): concatenate `outputTranscription` chunks intelligently without double spaces, start a new bot bubble on new turns (`turnComplete` boundary), and strip control/noise artifacts like `<no speech>` / `{pause}` before rendering.

### Phase 3 — Fix Greeting, Diagnostic Question Quality & Compatibility Mode
1. **Upgrade Greeting & KAM Flow ([LiveSession.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/live/LiveSession.ts#L136-L140), [prompt.ts](file:///c:/Users/VICTUS/Downloads/VAM/packages/core/src/prompt.ts)):**
   - Replace generic `"How can I help you today?"` with a crisp, domain-aware opener: greet Rajesh ji warmly, proactively call `get_seller_snapshot` / `analyze_sales_decline` (or immediately reference the 32.5% / ₹65k drop once fetched), and ask **one sharp, useful operational question** (e.g., whether the 13 newly out-of-stock SKUs like Cooker KT-101 / Tawa KT-118 or the 14% cancellation rate are driven by supplier payment hold-ups or dispatch bottlenecks) — max 2 focused questions before locking the 3 prioritised actions with ₹ impact, owner, and timeline (`<= ~25 words` per spoken turn).
   - Keep `data/scenarios.json` T01 expectations consistent if changing reactive greeting wording.
2. **Fix Compatibility Mode End-to-End ([server.ts](file:///c:/Users/VICTUS/Downloads/VAM/apps/api/src/server.ts#L142-L174), [App.tsx](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/App.tsx#L76-L197)):**
   - Pass `TOOL_DECLARATIONS` and a multi-step tool execution loop (`executeTool`) in `POST /api/chat` and return both `{ reply, toolEvents }` to the frontend so Compatibility mode runs the exact same deterministic analytics & populates the Stage Tracker, Agent Activity Feed, and 3-card Revenue Recovery Plan.
   - Store `SpeechRecognition` in a ref (`recognitionRef`) so `handleEndCall()` stops it cleanly, and send full `messages` history from `recognition.onresult` instead of a single turn.
3. **UI Ergonomics & Grounded Export ([ActionPlanCard.tsx](file:///c:/Users/VICTUS/Downloads/VAM/apps/web/src/components/ActionPlanCard.tsx), layout):**
   - Render `downloadSummary()` dynamically from `kpis`, `actionPlan`, `followup`, and `escalation` state.
   - Tighten vertical spacing/panel heights (`Transcript`, `ActivityFeed`) so the Call Controls, Cockpit, Transcript + Debug Input, and Recovery Plan fit cleanly at `1280×800` / `1366×768` without awkward cropping.

---

## 3. Verification Plan (How Success Will Be Proved Before Recording)

1. **Unit & API Suite (`pnpm -r build` & `pnpm -r test`):**
   - Add tests for `LiveSession` (`realtimeInput.audio` framing, mute gate, `reconnect()` option retention, `<no speech>{pause}` stripping), linear-interpolation `downsampleTo16k`, and `POST /api/chat` tool-execution loop.
2. **Real-Audio Live S2S Multi-Turn Verification Script:**
   - Stream 2+ real 16 kHz spoken PCM turns (greeting + seller question + seller confirmation) via the updated client code against an ephemeral token from `:8080`, asserting:
     - First-audio startup latency logged and dramatically reduced
     - Non-empty `inputTranscription` for both voice turns
     - Real tool calls (`get_seller_snapshot`, `analyze_sales_decline`, `create_action_plan`, `schedule_followup`) executed on `:8080`
     - Valid 24 kHz audio replies + barge-in interruption check (`interrupted`) without premature local self-flushing.
3. **Full Browser E2E Check (Chrome/Edge CDP or Playwright with fake mic audio capture):**
   - Verify **Live S2S** mode AND **Compatibility** mode at `http://localhost:5173`: zero console/page/WS errors, live mic RMS meter moving, real-time user + Asha transcripts, Stage Tracker progression, `Agent Activity Feed` populated, 3-card `Revenue Recovery Plan` locked in, `Mute` stops outgoing audio frames, `Assumptions` drawer opens/closes, and `Download Summary (.md)` outputs dynamic plan data.
4. **Eval Suite (`pnpm evals`):**
   - Update `evals/run-evals.mjs` / `apps/api/src/evals.ts` to enable tool execution across all 24 scenarios in `data/scenarios.json` and log exact grounded pass/fail results.
5. **Context Handoff (No `git` commands):**
   - Update `docs/CONTEXT.md`, `docs/TASKS.md`, `docs/SESSION_LOG.md`, and `docs/HANDOFF.md` strictly without running any `git` commands.
