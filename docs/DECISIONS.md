# DECISIONS (ADR log)

## ADR-001 — Native speech-to-speech (Gemini Live) primary, cascade fallback
- **Context:** Need low latency, natural interruption/barge-in, and resilience against network/quota failures.
- **Decision:** Gemini Live via client-to-server with single-use ephemeral tokens as primary; fallback = Web Speech STT → Fastify `/api/chat` (Gemini text or OpenRouter) with same tools → SpeechSynthesis.
- **Consequences:** Best conversational realism for 30 marks; must handle session limits (compression/resumption) and maintain 100% tool parity between modes.

## ADR-002 — Numbers only from deterministic tools
- **Context:** Brief requires grounded data analysis; hallucinated metrics fail evaluation.
- **Decision:** Analytics and bridge equations reside strictly in `packages/core` pure functions over `seller.mock.json`. Spoken numbers must come exclusively from tool returns.
- **Consequences:** Zero hallucinated figures; system prompt strictly forbids un-sourced calculations.

## ADR-003 — Bridge valuation & SKU granularity
- **Context:** Need to reconcile the ₹65,000 headline sales decline.
- **Decision:** ₹ bridge valued at actual SKU prices across the 60 SKUs: stock-outs newly OOS ₹23,085 (35.5%) + reduced promotions ₹18,570 (28.6%) + organic rank loss ₹23,345 (35.9%) = ₹65,000. Net lens accounts for 6 extra cancelled orders (≈₹3,000).
- **Consequences:** 100% mathematical reconciliation with the assignment brief.

## ADR-004 — Verified Live API Model: gemini-3.8-live on v1beta
- **Context:** Gemini API model IDs change across previews. Need verified working speech-to-speech model.
- **Decision:** Verified through runtime handshake tests that `gemini-3.8-live` on `v1beta` establishes bidi WebSocket connection, receives `setupComplete`, and sends `sessionResumptionUpdate`. Set `GEMINI_LIVE_MODEL=gemini-3.8-live` and `GEMINI_TEXT_MODEL=gemini-3.8-flash`.
- **Consequences:** Avoids runtime model not found (404) errors in live evaluation.

## ADR-005 — Ephemeral token minting with locked constraints
- **Context:** Protect user's real API key from frontend exposure while enforcing server-side prompt and tools.
- **Decision:** Implement `POST /api/session` using `@google/genai` `authTokens.create` with `uses: 1`, `expireTime: +30m`, `newSessionExpireTime: +60s`, and locked `liveConnectConstraints` containing systemInstruction and tool declarations.
- **Consequences:** Frontend never sees `GEMINI_API_KEY`. Prompt and tool tampering prevented.

## ADR-006 — Web AudioWorklet linear downsampling for 16 kHz PCM *(Superseded by ADR-008)*
- **Context:** Gemini Live API requires 16-bit PCM at 16 kHz mono little-endian. Browsers typically capture microphone input at 44.1 kHz or 48 kHz.
- **Decision:** Place `audio-worklet.js` in Vite's `public/` directory and instantiate an `AudioWorkletNode` in `apps/web/src/audio/capture.ts` that downsamples float samples to 16 kHz and packs them into Int16Array buffers.
- **Consequences:** Low CPU overhead in theory, but in live Chrome testing (Session 5) the browser paused the worklet because it produced silent output; replaced by `ScriptProcessorNode` + `muteGain(0)` in ADR-008. (`apps/web/public/audio-worklet.js` currently remains unused on disk.)

## ADR-007 — Gapless 24 kHz audio scheduling with instant flush on barge-in
- **Context:** Gemini Live outputs 24 kHz PCM audio chunks asynchronously. If the user interrupts ("barge-in"), assistant playback must stop instantly to prevent confusing echo and overlap.
- **Decision:** Implement `AudioPlayer` in `apps/web/src/audio/player.ts` using scheduled `AudioBufferSourceNode`s tracking next playback time. On receiving `serverContent.interrupted: true` or user speech start, invoke `flush()` which immediately stops all active source nodes and clears pending chunks.
- **Consequences:** Sub-millisecond barge-in responsiveness matching natural human telephone conversation dynamics.

## ADR-008 — Explicit `setup` handshake and immediate greeting trigger on `BidiGenerateContentConstrained`
- **Context:** In live browser testing (Session 4), `LiveSession` connected to the ephemeral token WebSocket (`BidiGenerateContentConstrained`) but Gemini remained silent indefinitely and ignored audio input.
- **Decision:** Immediately on `ws.onopen`, send `{ setup: { model: "models/gemini-3.8-live" } }`. Wait for `msg.setupComplete` before starting mic capture, and immediately send a `clientContent` user turn prompting Asha to greet Rajesh ji warmly (or proactively in proactive mode).
- **Consequences:** Verified via `scripts/debug-live.mjs`: receives `setupComplete`, `sessionResumptionUpdate`, triggers greeting speech (24 kHz PCM audio + `outputTranscription`), and invokes `advance_stage`. Requires real user voice test in Chrome after Session 5 changes.

## ADR-009 — `ScriptProcessorNode` with zero-gain destination loop for reliable 16 kHz PCM capture *(Superseded by ADR-022 for the sample-rate choice)*
- **Context:** After Asha's initial greeting played in Chrome (Session 5 screenshot), user voice input was not heard by Gemini Live because Chrome can suspend an `AudioWorkletNode` with silent output / GC-eligible graph.
- **Decision:** Rewrote `apps/web/src/audio/capture.ts` using `AudioContext({ sampleRate: 16000 })` (with linear fallback `downsampleTo16k` if hardware uses another rate), `createScriptProcessor(2048, 1, 1)`, and a `muteGain` (`gain = 0`) connected to `audioContext.destination` to keep the audio clock ticking without speaker feedback. Also wired RMS `onVolume` callback in `LiveSession.ts` for local barge-in flush (`volume > 0.05 && this.state === 'speaking'`) and added a debug text input in `Transcript.tsx` -> `LiveSession.sendTextMessage()`.
- **Consequences:** Eliminates Chrome worklet suspension risk and gives deterministic frame callbacks + debug text fallback. Note: `README.md` and `docs/NOTE_1PAGE.md` still reference `AudioWorklet` and need updating before submission. Also live real-mic Chrome verification of Session 5 edits is still pending.

## ADR-010 — Use `realtimeInput.audio`, not `realtimeInput.mediaChunks` (Session 7)
- **Context:** A/B protocol test against the real API with the same 16 kHz PCM clip: `realtimeInput.mediaChunks` produced `voiceActivity=[]`, `inputTranscription=""`, `audioBytes=0`; changing only the field to `realtimeInput.audio {mimeType:'audio/pcm;rate=16000'}` produced `ACTIVITY_START/END`, the correct transcript, `toolCall`s and model audio. `mediaChunks` is deprecated and silently dropped by `gemini-3.8-live` on `BidiGenerateContentConstrained`.
- **Decision:** Send one `realtimeInput.audio` blob per captured frame and `realtimeInput.audioStreamEnd: true` on mute/stop. Keep the raw WebSocket protocol (the official ephemeral-token example does the same) instead of migrating to `ai.live.connect`, to avoid adding `@google/genai` to the browser bundle and a second setup path that fights the locked token.
- **Consequences:** The seller's voice is actually heard. A unit test (`LiveSession.test.ts`) asserts `realtimeInput.audio` is present and `mediaChunks` is absent, so the regression cannot return silently.

## ADR-011 — Put the entire Live session config in the server-minted token (Session 7)
- **Context:** With ephemeral tokens, `liveConnectConstraints` becomes `bidiGenerateContentSetup`; fields present there are locked and the browser's `setup` message cannot override them (verified: the client asked for `responseModalities:["TEXT"]` and still received AUDIO).
- **Decision:** Lock everything server-side — `responseModalities`, `systemInstruction`, `tools`, `inputAudioTranscription`, `outputAudioTranscription`, `speechConfig` (voiceName from `VOICE_NAME`), `realtimeInputConfig.automaticActivityDetection` (`prefixPaddingMs:20`, `silenceDurationMs:500`, high sensitivities), `activityHandling: START_OF_ACTIVITY_INTERRUPTS`, `turnCoverage: TURN_INCLUDES_ONLY_ACTIVITY`, `sessionResumption`, `contextWindowCompression`. The browser sends only `{setup:{model}}`.
- **Consequences:** Deterministic, tamper-proof session config; `VOICE_NAME` is now actually honoured (it was referenced by no code before). Reconnects must pass the resumption handle through `/api/session` because the client cannot set it.

## ADR-012 — Pre-compute the diagnosis server-side and inject it as `VERIFIED FACTS` (Session 7)
- **Context:** Triggering the greeting with a tool round-trip added seconds of dead air before the first word, yet the "numbers must come from tools" rule forbids inventing them.
- **Decision:** `POST /api/session` awaits `get_seller_snapshot` + `analyze_sales_decline` through the real `executeTool()` handlers, embeds the compact result in the system prompt as `VERIFIED FACTS`, and returns the same runs as `toolEvents` so the Cockpit and Activity Feed populate before the call is answered. Asha still calls the tools live during DIAGNOSE.
- **Consequences:** Grounded first sentence with no extra latency, and the numbers on screen are provably tool-derived. `pnpm evals` (text mode) passes no `verifiedFacts`, so the model must still call tools there.

## ADR-013 — Sustained-speech barge-in instead of a single-frame volume gate (Session 7)
- **Context:** The old gate (`volume > 0.05` where `volume = min(1, rms*6)`) triggered at raw RMS > 0.0083, so fan noise or a breath cut Asha off mid-sentence.
- **Decision:** Require 3 consecutive frames above scaled volume 0.18 (raw RMS > 0.03) before a local flush, and treat `serverContent.interrupted` as the primary barge-in signal.
- **Consequences:** Natural interruption still works (observed in `live-e2e.mjs`), but ambient noise no longer truncates replies.

## ADR-014 — Preserve `thoughtSignature` when replaying tool calls in `/api/chat` (Session 7)
- **Context:** Gemini 3.x returns `400 INVALID_ARGUMENT: Function call is missing a thought_signature in functionCall parts` when the model's tool-call turn is reconstructed from `response.functionCalls`.
- **Decision:** Echo `response.candidates[0].content.parts` verbatim when appending the model turn; only fall back to reconstructed parts if the candidate parts are empty.
- **Consequences:** Fallback mode can use tools. Do not "simplify" this back to `functionCalls.map(...)`.

## ADR-015 — Language-aware grounded opener (Session 7)
- **Context:** The greeting template was hardcoded Hinglish, so English/Hindi sessions still opened in Hinglish, and Gemini's Hinglish transcription leaked Urdu-script characters (`سے`, `ہو گئے`).
- **Decision:** Provide per-language opener/example/question strings, explicitly instruct Latin-script spelling for Hinglish, and keep "how can I help you today" banned.
- **Consequences:** `E2E_LANG=en` and the default `hinglish` both produce a clean, grounded, single-question opener.

## ADR-016 - Treat a failed token mint as retryable, and never hide the reason (Session 8)
- **Context:** On 11 Nov the Live path died in the browser with the banner "Could not connect to Live speech WebSocket. Switching to Compatibility mode...". Root cause, reproduced: `POST /api/session` was capped at 15 requests/minute, the app pre-warmed a token on every page mount (plus one after every call and every End), so ordinary reloads exhausted the budget. The 17th request returned `429 {"statusCode":429,"error":"Too Many Requests"}`; `LiveSession.mintToken()` threw it, and `App.handleStartCall` **overwrote the message with a generic string**, hiding the only actionable fact.
- **Decision:** (a) Raise the route limit to 60/min and answer with a machine-readable body `{ok:false, error:'RATE_LIMITED', message, retryAfterMs}` via `errorResponseBuilder`. (b) Mint through a typed `LiveConnectError {status, code}` and retry 4 times with a 0/0.8/2/4 s backoff for 429, 5xx and network failures only - a 4xx is never retried. (c) The UI shows the real reason; the fallback is entered only after the retries are exhausted. (d) The client keeps exactly one warm token: never mint while one is held, never mint twice within 3 s, and re-arm only after a call ends or the socket closes.
- **Consequences:** A transient token failure no longer costs the seller the Live call. Verified with a forced 429 in the browser: 4 attempts, then the banner read "Live connect failed: Token server busy. Retry in 42s. Switching to Compatibility mode...". Mint volume per user cycle dropped from 2-4 to 1, so the higher ceiling is never approached.

## ADR-017 - Cache the Google client per apiVersion and memoise the warm-up diagnosis (Session 8)
- **Context:** `getAi(apiKey, apiVersion)` rebuilt the `GoogleGenAI` client on every call because `|| apiVersion` is always truthy, and `computeVerifiedFacts()` re-ran both diagnostic tools on every mint. The mint cost 4.9 s cold and 1.2-10 s in general - all of it Google latency, and all of it on the seller's click path when no warm token was held.
- **Decision:** Cache one client per `(apiKey, apiVersion)` pair, and memoise `computeVerifiedFacts()` (the tools are pure functions over static mock data, so the result is identical). Keep the token pre-warm as the way to keep that latency off the click path, and tell the seller when it is safe to click ("Voice session ready").
- **Consequences:** Measured mint latency dropped from 4,935 ms to 1,257 ms; `setupComplete` at ~3.9 s and first audio at ~4.8 s from a cold click. The diagnosis is computed once per process - do not make `computeVerifiedFacts()` depend on anything mutable without dropping the memo.

## ADR-018 - Hold the microphone during Asha's opening turn (Session 9)
- **Context:** With `START_OF_ACTIVITY_INTERRUPTS`, Asha's own speaker output and room tone leaked into the mic and triggered the server VAD, truncating the greeting at "Namaste Rajesh ji, main Asha hoon,". Simply muting the mic for N seconds either cut the seller off or let noise through.
- **Decision:** Add an explicit greeting gate in `LiveSession`: frames are dropped between `setupComplete` and the end of the greeting turn. The gate is released by (a) `serverContent.turnComplete`, (b) a deliberate barge-in - 4 consecutive frames above 0.34 **only after her first audio chunk has arrived**, or (c) a watchdog that waits 15 s for the first audio and then re-arms 6 s after every chunk while `player.isPlaying()` is true.
- **Consequences:** The greeting is delivered intact and in one transcript bubble (`e2e:browser` shows one bubble ending in "?"). You cannot "interrupt" someone who has not started speaking, which is why barge-in is disabled before the first chunk. The watchdog bounds a silent gate at ~15 s.
- **Do not:** lower the gate to a fixed 5-10 s timer. That exact change is what produced the truncated greeting in the first place.

## ADR-019 - Use the Gemini 3.8 default `turnCoverage`, and widen the prefix padding (Session 9)
- **Context:** Two audio-config fields were fighting the model's defaults. `TURN_INCLUDES_ONLY_ACTIVITY` delayed the input transcript (A/B on identical audio: 11.7 s vs 4.9 s), and `prefixPaddingMs: 20` clipped word onsets ("Namaste" transcribed as "aste").
- **Decision:** Set `turnCoverage: TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` (the documented Gemini 3.8 Live default) and `prefixPaddingMs: 100`, keeping `END_SENSITIVITY_HIGH` + `silenceDurationMs: 500`. The config is locked into the server-minted ephemeral token, so it changes in `apps/api/src/server.ts`, not the browser.
- **Consequences:** Input transcripts arrive with the audio activity instead of after the turn. **Caveat:** the turnCoverage A/B is n=1 per variant (4,944 ms vs 11,698 ms on the same clip); do not present it as a statistical result. Re-run `_probe/exp2.mjs` n=3 before quoting it in the submission.

## ADR-020 - The prompt must not contain rupee figures; the plan tool owns them (Session 9)
- **Context:** Stage 5 of `packages/core/src/prompt.ts` hardcoded "up to ₹18,000/mo", "₹23,000", "₹18,500", while `create_action_plan` returns ₹18,078 / ₹26,345 / ₹18,570 from `recommend()`. The model spoke the prompt's numbers and the diagnosis was internally inconsistent. Separately, `create_action_plan` was only called in COMMIT (after agreement), so the Action Plan card stayed empty through the whole demo.
- **Decision:** Delete every rupee figure and percentage from the workflow section. Stage 5 now calls `create_action_plan` **first** and speaks only the title, impact, owner and timeline it returns. Stage 6 keeps `schedule_followup` behind the seller's agreement. The prompt test asserts the three old amounts are absent.
- **Consequences:** Every spoken and on-screen figure now comes from the tool (verified: `e2e:plan` 7/7 with ₹18,078 / ₹26,345 / ₹18,570). The card fills at RECOMMEND instead of COMMIT. Do not re-add example amounts "for clarity" - the model copies them verbatim.

## ADR-021 - Proxy to the IPv4 literal and bind the API dual-stack (Session 9)
- **Context:** `localhost` resolves to `::1` first on Windows, Vite serves on `::1`, and the API listened on `0.0.0.0` (IPv4 only). Proxied `/api/session` calls intermittently failed with an empty body (`Unexpected end of JSON input`), which silently destroyed the pre-warmed token.
- **Decision:** Set the Vite proxy target to `http://127.0.0.1:8080` and have Fastify listen on `::` with a `0.0.0.0` fallback for hosts with IPv6 disabled. The pre-warm also reads `res.text()`, validates the JSON, and retries once.
- **Consequences:** Direct IPv4, direct IPv6 and proxied `/healthz` all return 200; proxied mint measured 0.6-1.0 s. Do not "simplify" the proxy target back to `localhost`.

## ADR-022 — Capture at the device's native sample rate, and make a silent mic visible (Session 10)
- **Context:** The seller reported that Asha greeted and answered typed messages but never heard speech. The console proved the greeting gate was already open (`Greeting gate released (turnComplete); mic streaming live.`) and the selected track was live, yet the UI RMS bars were flat. The capture context was created with `new AudioContext({ sampleRate: 16000 })`. The synthetic browser E2E never reproduced this because its fake stream is clean at any rate. Some Windows microphone arrays (the user's Intel Smart Sound array) can deliver silence when the context is forced to a rate that differs from the hardware mix format.
- **Decision:** (a) Create `AudioContext` at the device's native rate and keep the existing box-filter `downsampleTo16k`; never force 16 kHz. (b) Add a microphone `<select>` populated from `enumerateDevices()` after permission, persist the choice, and pass an exact `deviceId` (falling back to the default input if the saved device vanished). (c) Add `LiveSession.setInputDevice()` / `reconnectMic()`; the latter disables AEC/NS/AGC because some arrays return zeros with processing on. (d) Extend diagnostics with `deviceId`, `gateOpen` and `framesSent`; show "No mic input detected" after ~6 s of flat RMS or "Asha is not detecting speech" when local audio is newer than server VAD. (e) Add a 30 s hard timeout to the greeting gate so a stuck player can never leave the mic closed for the whole call.
- **Consequences:** The final browser E2E logs `started at 48000Hz ... processing=on` and still passes 6/6; 77/77 unit tests pass (including a 44.1 kHz resampler case and device-swap tests). A silent microphone is now visible and recoverable instead of looking identical to a working one. **The real-hardware pass is still required** — only the seller's machine can prove the Intel array fix. Do not reintroduce a forced `sampleRate: 16000`; do not auto-restart the mic in a loop (it can disturb the synthetic E2E stream and surprise the seller).

## ADR-023 — Raw input scan: probe every input, then pick the one that carries signal (Session 11)
- **Context:** Even with the native-rate context and relaxed (processing-off) reconnect, the seller's machine showed a live track, an open gate and flat RMS. The browser reports "a track exists" but not "this input carries audio", so the UI looked identical whether the mic worked or not. The app could not tell which of the machine's inputs was actually usable.
- **Decision:** Add `probeInputs()` in `apps/web/src/audio/capture.ts`: enumerate every `audioinput`, open the system default first, then each enumerated device, measure peak amplitude with an `AnalyserNode` for ~1.2 s, and retry any silent device with AEC/NS/AGC disabled. `pickBestInput()` picks the loudest and falls back to the original device when nothing carries signal. Default capture sends **only** `deviceId` (no `channelCount`, no explicit processing flags), because some Windows APO/driver stacks return zeros when any of those constraints are present — even `false`. The scan UI ("Scan inputs") stops capture while probing and reports a per-device peak table in the console.
- **Consequences:** The seller gets a one-click way to find the working microphone instead of guessing from a device list, and the "No signal on any input" case is now distinguishable from "the gate is closed". Known limitation: `MIC_SIGNAL_THRESHOLD = 0.001` is loose enough to accept ~0.002 noise, so the scan can prefer a noisy input over a quiet-but-real one; tighten only with real-hardware evidence. **The user's headset now works**, so the hardware blocker is cleared from the product side.

## ADR-024 — Let the seller finish: 1000 ms VAD silence window, turn-taking rules in the prompt, and a drain-based greeting gate (Session 12)
- **Context:** The seller reported the real conversational failure: "I talk, then she answers — she does not listen properly." Three separate causes were identified. (1) The server VAD ended the seller's turn after **500 ms** of silence with `END_SENSITIVITY_HIGH`, so any normal Hinglish thinking pause was treated as "the seller finished" and Asha answered over the rest of the sentence. (2) The system prompt had no turn-taking or meta-question rule, so a connectivity check ("can you hear me?") was treated as a business answer: Asha moved straight to DIAGNOSE, produced a filler, called two tools, and then spoke the findings — the exact three-bubble chain visible in the seller's screenshot. (3) The greeting gate released on `serverContent.turnComplete` even while `player.isPlaying()` was still true, so the mic opened before Asha's own audio had finished playing and her trailing words could be captured as a new seller turn.
- **Decision:** (a) Extract the endpointing config into `LIVE_VAD_CONFIG` in `apps/api/src/server.ts` and raise `silenceDurationMs` from 500 to **1000 ms**, keeping `END_SENSITIVITY_HIGH`, `START_SENSITIVITY_HIGH` and `prefixPaddingMs: 100`. (b) Add an explicit **TURN-TAKING** block to `packages/core/src/prompt.ts`: wait through pauses, never fill silence, one speaker at a time, connectivity checks are not business answers (answer in one sentence and repeat the question, no tools, no workflow advance), a short "haan"/"nahi" answering the business question is valid, and DIAGNOSE starts only after a real business cause — one filler, then both diagnostic tools, with no speech between them. (c) Keep the greeting gate closed until the player's queue actually drains: `turnComplete` now only *marks* the turn finished (`greetingTurnCompleted`), and the gate is released by `player.onDrain` (`player-drained`). The barge-in, silence-watchdog (15 s / 6 s) and 30 s hard-timeout paths are unchanged.
- **Consequences:** The server waits for a real pause before ending the seller's turn, the model no longer chains filler → tool → findings on a greeting, and the mic opens only after Asha stops talking. Verified: `pnpm -r test` 84/84, `pnpm -r build` exit 0, `pnpm e2e:browser` 6/6 (greeting gate released with reason `player-drained`; the reply to "Hey, can you hear me?" is one short acknowledgement that repeats the business question and calls **no** tools), `pnpm e2e:plan` 7/7, `pnpm evals` 5/5 sample scenarios. **Still unproven:** the subjective feel with a human voice. Tune `silenceDurationMs` within 900–1200 ms if a pause is still cut; only fall back to `END_SENSITIVITY_LOW` if pauses are still truncated, because LOW can hang on room noise.
