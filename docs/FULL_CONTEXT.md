# FULL PROJECT CONTEXT & CHRONOLOGICAL HANDOFF (`Snapdeal Voice KAM — "Asha"`)

> **Generated:** 11 Nov 2026, ~06:58 IST  
> **Hard Submission Deadline:** **11 Nov 2026, 11:15 AM IST** (Internal target: **08:30 AM IST**)  
> **Purpose:** Complete scratch-to-now engineering history, architecture, verified state, file inventory, resolved bugs, open gaps, and exact resume instructions so another model/harness can continue seamlessly with zero loss.

> [!IMPORTANT]
> **This file is a frozen snapshot of Sessions 1–6 (up to ~06:58 IST). It is NOT the current state.**
> Sections 2–6 describe the codebase as it was that morning: the old UI (`Orb`, `Cockpit`, `ActivityFeed`), 30 core tests, no greeting gate, no raw input scan and a 500 ms VAD window. All of that has changed.
> **For the current state read `docs/CONTEXT.md` (living state), `docs/HANDOFF.md` (resume prompt) and `docs/SESSION_LOG.md` (Sessions 7–12).** Keep this file only as the historical build log; §7 below is superseded by the resume prompt in `docs/HANDOFF.md`.

---

## 1. Mission, Rubric & Strict Constraints

### Assignment Goal
Build a **voice-first, agentic Virtual Key Account Manager ("Asha")** web app for a Snapdeal seller whose sales dropped significantly this month, helping diagnose causes, rule out pricing, recommend **exactly 3** practical actions with rupee upside, commit an action plan, and schedule follow-up.

### Evaluation Rubric (100 Marks)
1. **Voice interaction & natural conversation:** 30
2. **Understanding seller queries:** 20
3. **Quality of business recommendations:** 20
4. **AI implementation & workflow:** 20
5. **Creativity & execution:** 10

### Non-Negotiable Rules (`AGENTS.md`)
1. **Voice-first:** Real two-way speech conversation is mandatory (text box exists strictly as an optional debug/accessibility aid).
2. **All numbers come from tools:** The LLM never invents or computes arithmetic; every metric/rupee figure comes from deterministic `packages/core` functions over `data/seller.mock.json`.
3. **Exactly 3 recommendations:** Prioritised, with estimated `"up to"` / `"around"` rupee impact, owner, and timeline.
4. **Short spoken turns:** `<= ~25 words` per turn (except the final structured recap), max **3 probing questions** (one at a time), natural filler before tool calls so the call never goes silent.
5. **Explicit assumptions:** Visible in the UI Assumptions Drawer (`A1–A9`) and technical note.
6. **Mock data only:** No real Snapdeal data/credentials/PII.
7. **STRICT USER DIRECTIVE (Overrides default git instructions in `AGENTS.md` / skills):**  
   **DO NOT commit anything and DO NOT run ANY `git` commands** (`git add`, `git commit`, `git status`, `git log`, or `pnpm handoff` which invokes `scripts/handoff.mjs` -> `git`).

---

## 2. Environment, Tooling & Credentials

- **Workspace:** `c:\Users\VICTUS\Downloads\VAM` (Windows)
- **Runtime:** Node.js `v20.20.2` (via `C:\nvm4w\nodejs`), pnpm `8.15.1`
  - **Sandbox Gotcha:** On this Windows host, `C:\nvm4w\nodejs` is a directory junction that the standard sandbox cannot traverse. Run `node` / `pnpm` commands with `BypassSandbox: true`.
- **Key Dependencies:**
  - Root: `typescript ^5.4.5`, pnpm workspaces (`packages/*`, `apps/*`)
  - `@kam/core`: `zod ^3.23.8`, `vitest ^1.6.0`
  - `api`: `fastify ^4.27.0`, `@fastify/cors ^9.0.1`, `@fastify/rate-limit ^9.1.0`, `@google/genai ^3.0.0`, `pino ^9.1.2`, `dotenv ^16.4.5`, `zod ^3.23.8`, `tsx ^4.10.5`
  - `web`: `react ^18.3.1`, `react-dom ^18.3.1`, `vite ^5.2.11` (built with `5.4.21`), `tailwindcss ^3.4.3`, `zustand ^4.5.2`, `framer-motion ^11.2.10`, `lucide-react ^0.381.0`
- **`.env` Keys Currently Configured** *(values redacted for any secret)*:
  - `GEMINI_API_KEY`: **SET** (never expose to frontend or docs)
  - `GEMINI_LIVE_MODEL=gemini-3.8-live`
  - `GEMINI_TEXT_MODEL=gemini-3.5-flash-lite`
  - `VOICE_NAME=Aoede`
  - `OPENROUTER_API_KEY`: empty
  - `OPENROUTER_MODEL`: empty
  - `ALLOWED_ORIGINS=http://localhost:5173`
  - `PORT=8080`

---

## 3. Complete Chronological Build Log (From Scratch to Now)

### Initial Intake & Planning (10 Nov 2026 ~17:50 IST)
- Reviewed assignment screenshots (email from Sourav Chakraborty + Practical Assignment PDF), `AGENTS.md`, `docs/MASTER_PLAN.md`, `Snapdeal_Voice_KAM_Master_Plan_v2.md`, `seller.mock.json`, and `scenarios.json`.
- Created and received user approval for `EXECUTION_PLAN.md` mapping tasks **T00–T24** across Phases 0–8.

### Session 1: Monorepo Scaffold & Guard Files (~18:00–18:30 IST, T00)
- Configured pnpm monorepo (`pnpm-workspace.yaml`, root `package.json`) with 3 workspaces: `packages/core` (`@kam/core`), `apps/api` (`api`), `apps/web` (`web`).
- Created `.env` (verified gitignored in `.gitignore`) and `.env.example`, copied mock data/scenarios into `data/`, `packages/core/src/data/`, and `evals/`.
- Created living context docs (`docs/CONTEXT.md`, `docs/TASKS.md`, `docs/SESSION_LOG.md`, `docs/DECISIONS.md`, `docs/HANDOFF.md`, `docs/REVIEW_CHECKLIST.md`) plus `.agents/skills/*` and `scripts/handoff.mjs` / `handoff.sh`.

### Session 2: Live API Verification, Core Brain & Fastify Backend (~18:30–19:25 IST, T01–T08)
- **T01 (Live API Verification — ADR-004):**
  - Updated `@google/genai` to `^3.0.0` (earlier `^0.1.2` didn't exist).
  - Probed `models.list()` (`scripts/test-gemini.mjs`, `apps/api/src/test-*.ts`). Discovered legacy `gemini-2.0-flash*` and `gemini-2.5-*` returned 404; confirmed **`gemini-3.8-live` on `v1beta`** works for Live bidirectional WebSocket and **`gemini-3.5-flash-lite` / `gemini-3.8-flash`** work for text fallback.
  - Verified server ephemeral token minting via `ai.authTokens.create` (`httpOptions: { apiVersion: 'v1alpha' }`).
- **T02 (Types & Data Provider):**
  - Built Zod schemas in `packages/core/src/types.ts` (`SellerDataSchema`, `SkuSchema`, `PeriodMetricsSchema`, `ActionPlanSchema`, `FollowupSchema`, `EscalationSchema`, `StageSchema`) and `MockSellerProvider` (`DataProvider` interface) in `packages/core/src/provider.ts`.
- **T03 (Deterministic Analytics Engine — ADR-002, ADR-003):**
  - Implemented `snapshot()`, `bridge()`, `ruledOut()`, `analyzeSalesDecline()` in `packages/core/src/analytics.ts`. Fixed JS IEEE-754 float precision in `cancelDeltaPts` with `Math.round()`.
  - Verified exact mathematical reconciliation across all 60 SKUs in `seller.mock.json`:
    - Orders: `400 -> 270` (`-130` / `-32.5%`)
    - Gross Sales: `₹2,00,000 -> ₹1,35,000` (`-₹65,000` / `-32.5%`)
    - OOS SKUs: `5 -> 18` (`+13` newly OOS, 5 chronic dead listings)
    - Cancellation Rate: `8% (32) -> 14% (38)` (`+6 pts`)
    - ASP: `₹500 -> ₹500` (`0%` flat -> **pricing ruled out data-driven**)
    - Revenue Bridge: Stockouts `₹23,085` (`51` orders, `35.5%`) + Ad Cuts `₹18,570` (`35` orders, `28.6%`) + Organic Rank Drop `₹23,345` (`44` orders, `35.9%`) = **`₹65,000` (`130` orders)** (+~`₹3,000` net extra cancellations). Top-4 hero OOS SKUs = `₹18,078` (`78.3%` of stockout loss).
- **T04 (Recommendation Engine):**
  - Implemented `recommend()` in `packages/core/src/recommend.ts` returning **exactly 3** prioritised actions, top-4 SKUs (`KT-101`, `KT-118`, `ST-204`, `HM-310`), `₹27,565` supplier restock cost, ROI-phased ordering advice for `~₹1.2 lakh` pending supplier dues (`cashTight`), `₹33,065` phased capital (`₹27,565 + ₹5,500` ads), and realistic recovery range `₹39,000–₹48,100` (`60%–74%`).
- **T05 (8 Deterministic Tools):**
  - Implemented `TOOL_DECLARATIONS` & `executeTool()` in `packages/core/src/tools.ts` with Zod validation, 2s `Promise.race` timeout, and `{ ok, data, error }` envelope:
    1. `get_seller_snapshot`
    2. `analyze_sales_decline`
    3. `get_out_of_stock_products`
    4. `get_cancellation_breakdown`
    5. `advance_stage` (`discover` | `diagnose` | `probe` | `recommend` | `commit` | `summarise` | `close`)
    6. `create_action_plan`
    7. `schedule_followup`
    8. `escalate_to_human_kam`
- **T06 & T07 (Fastify API Server & Ephemeral Tokens — ADR-005):**
  - Implemented `apps/api/src/server.ts`: `/healthz`, `POST /api/session` (rate limit 15/min, mints single-use token `uses: 1`, `expireTime: +30m`, `newSessionExpireTime: +60s`, locked `liveConnectConstraints` with `Modality.AUDIO`, `systemInstruction`, and all 8 `TOOL_DECLARATIONS`), `POST /api/tools/:name`, and `POST /api/chat`.
- **T08 (System Prompt Builder):**
  - Built `buildSystemPrompt()` in `packages/core/src/prompt.ts` supporting `en` / `hi` / `hinglish` and `reactive` / `proactive` modes, enforcing `<= 25 words`, fillers before tool calls, strict grounding, 7-stage flow, and guardrails (commission disputes -> escalate, off-topic redirect, prompt injection defense).
- **Verified at end of Session 2:** 36 tests passed (`packages/core`: 30, `apps/api`: 5, `apps/web`: 1). User issued strict rule: **no git commits or git commands**.

### Session 3: Initial Voice Pipeline, UI Cockpit, Evals & Submission Docs (~19:25–20:00 IST, T09–T19, T24)
- **T09 & T10:** Created `apps/web/public/audio-worklet.js` (`PCMCaptureProcessor`), `apps/web/src/audio/capture.ts`, and `apps/web/src/audio/player.ts` (24 kHz `AudioBufferSourceNode` scheduler + instant `flush()` + `apps/web/src/audio/player.test.ts` with 3 tests).
- **T11:** Created `apps/web/src/live/LiveSession.ts` (WebSocket client to `BidiGenerateContentConstrained`, `toolCall` -> `/api/tools/:name` via `toolBridge.ts`, `sessionResumptionUpdate`, `goAway` reconnect).
- **T12–T18:** Built Zustand store (`apps/web/src/store/useCallStore.ts` auto-updating KPIs, stage, actionPlan, followup, escalation from `toolEvents`), Vite `/api` proxy (`apps/web/vite.config.ts`), and all React components: `Header.tsx` (proactive button, Hinglish/English/Hindi toggle, Live S2S / Compatibility toggle, Assumptions drawer trigger), `StageTracker.tsx`, `Orb.tsx`, `Cockpit.tsx`, `Transcript.tsx`, `ActivityFeed.tsx`, `ActionPlanCard.tsx` (with `.md` summary export), `AssumptionsDrawer.tsx` (`A1–A9`), and `App.tsx`.
- **T19 & T24:** Wrote `evals/run-evals.ts`, `evals/run-evals.mjs`, `apps/api/src/evals.ts` (5/5 sampled scenarios `T01, T02, T04, T14, T17` ran with fallback model helper), plus `README.md`, `docs/NOTE_1PAGE.md`, and `docs/DEMO_SCRIPT.md`.
- Updated `packages/core/package.json` (`exports` -> `./dist/index.js`) and `packages/core/src/provider.ts` (multi-candidate `seller.mock.json` resolution across `src/`, `dist/`, and workspace root) so compiled Node (`node apps/api/dist/server.js`) works alongside `tsx`/`vite`.

### Session 4: Debugging Silence After Clicking "Start Voice Call" (~20:10–20:55 IST)
- **Problem:** User ran `:5173`, clicked "Start Voice Call", and nothing happened ("not listen anything").
- **Root Cause Found:** `LiveSession.ts` opened `BidiGenerateContentConstrained` WebSocket **without sending the required `{ setup: { model: "models/gemini-3.8-live" } }` handshake**, so Gemini waited silently forever and ignored audio chunks.
- **Fixes Applied:**
  1. Sent `{ setup: { model: "models/" + liveModel } }` inside `ws.onopen`.
  2. Gated microphone capture startup on `msg.setupComplete` (with mic permission error surfacing).
  3. Sent an automatic `clientContent` greeting trigger right after `setupComplete` so Asha speaks immediately on connect.
  4. Raised timeout in `apps/api/src/server.test.ts` on the live `POST /api/session` test to 15s.
- **Verification:** Created & ran `scripts/debug-live.mjs` — received `setupComplete`, `sessionResumptionUpdate`, `advance_stage` tool call -> tool result `{ok: true}`, `outputTranscription: "Namaste Rajesh ji, "`, and 24 kHz PCM audio chunks! User subsequently heard Asha speak her greeting in Chrome and saw `advance_stage()` in Activity Feed (`21:01 IST` screenshot).

### Session 5: Debugging "Asha don't listen my voice" Post-Greeting (~21:00–21:35 IST)
- **Problem:** In user's `21:01 IST` screenshot, Orb showed `"MIC ON / Listening to you..."` and Asha's Hinglish greeting appeared + played, **but after Asha finished speaking, Asha did not respond to the user speaking twice.**
- **Diagnosis:** Chrome can pause/GC-sweep an `AudioWorkletNode` when its output graph doesn't actively write to destination audio; also `capture.ts` was not passing `onVolume` back to `LiveSession`.
- **Fixes Applied (ADR-009):**
  1. Rewrote `apps/web/src/audio/capture.ts` to drop `AudioWorkletNode` and instead use `AudioContext({ sampleRate: 16000 })` (with `downsampleTo16k` fallback for 44.1/48 kHz devices), `createScriptProcessor(2048, 1, 1)`, and a **`muteGain` (`gain.value = 0`) connected to `audioContext.destination`** so Chrome's audio clock runs continuously without speaker feedback.
  2. Wired `onVolume` callback in `LiveSession.ts` so `volume > 0.05` while `state === 'speaking'` triggers `this.player.flush()` (local barge-in).
  3. Added `LiveSession.sendTextMessage(text)`, plus an inline text input bar at the bottom of `apps/web/src/components/Transcript.tsx` wired to `handleUserSendMessage` in `App.tsx` (both Live `clientContent` & fallback `/api/chat`).
- **Build & Unit Tests Run:** `pnpm -r build` (exit 0) and `pnpm -r test` (39/39 passing).
- **IMPORTANT:** No user confirmation / live browser mic test was run **after** Session 5 changes, and a server/harness restart occurred at `2026-11-11T01:08:39Z`.

### Session 6: Full Context Audit Before Model Switch (11 Nov 2026 ~06:38–06:58 IST)
- Verified live state right now in workspace:
  - `pnpm -r build` -> **passed (exit 0)** (`packages/core`, `apps/api`, `apps/web` Vite bundle).
  - `pnpm -r test` -> **39/39 passed** (`@kam/core`: 30 tests across 6 files; `apps/web`: 4 tests across 2 files; `apps/api`: 5 tests including live token mint in 7.63s).
  - Active ports check -> **`5173` (`apps/web`) LISTENING**, **`8080` (`apps/api`) NOT LISTENING** (must be restarted!).
- Audited codebase vs docs and updated `docs/DECISIONS.md`, `docs/TASKS.md`, `docs/SESSION_LOG.md`, `docs/CONTEXT.md`, `docs/HANDOFF.md`, `docs/HANDOFF.auto.md`, created `docs/FULL_CONTEXT.md`, and synced root `CONTEXT.md` & `HANDOFF.md`.

---

## 4. Reconciled Business Data & Deterministic Bridge (`data/seller.mock.json`)

- **Seller:** Rajesh Sharma — *Sharma Home Essentials*, Kanpur (`SD-48213`)
- **Catalog:** 60 active SKUs (`42` in stock, `13` newly OOS this month, `5` chronic dead SKUs)
- **Month-over-Month Metrics:**
  - Sales: `₹2,00,000 -> ₹1,35,000` (`-₹65,000` / `-32.5%`)
  - Orders: `400 -> 270` (`-130` / `-32.5%`)
  - Cancellation Rate: `8% (32)` -> `14% (38)` (`+6 pts`, `55%` post-order OOS)
  - Out-of-Stock Products: `5 -> 18` (`+13` newly OOS)
  - ASP: `₹500 -> ₹500` (`0%` -> pricing ruled out!)
  - Impressions / Dispatch SLA Breaches / Rating: `1,20,000 -> 84,000` (`-30%`), SLA breaches `6% -> 15%`, Rating `4.2 -> 4.0`
- **Revenue Bridge:** `₹23,085` (13 newly OOS, 51 orders) + `₹18,570` (Ad spend cut `₹8,000 -> ₹2,500`, 35 orders) + `₹23,345` (Organic rank/impressions drop, 44 orders) = **`₹65,000` (`130` orders)**
- **Top 4 Hero OOS SKUs (Restock Priority):** `KT-101` (Cooker), `KT-118` (Tawa), `ST-204` (Containers), `HM-310` (Mop) — combined loss `₹18,078` (`78.3%` of stockout loss), supplier restock cost `₹27,565`, phased ROI priority if cash is tight due to `~₹1.2 lakh` pending supplier dues.

---

## 5. Honest Gaps, Known Bugs & Risks (For the Next Model)

1. **API Server (`:8080`) Is Currently Down:** After the server restart at `01:08Z`, `:5173` is running, but `:8080` is NOT. Start `pnpm --filter api dev` (`BypassSandbox: true`, `IsDaemon: true`) immediately!
2. **Real-Mic Two-Way Voice After Session 5 Rewrite Is UNVERIFIED:**
   - Must test in Chrome at `http://localhost:5173` with real mic speech AFTER Asha's greeting finishes.
   - If Asha still doesn't respond to voice after Session 5's `ScriptProcessorNode` change, inspect Chrome DevTools Console + Network WS frames:
     - Check whether `[AudioCapture] Successfully started mic capture...` logs and `ws.send(realtimeInput)` fires cleanly.
     - Check Gemini Live `v1beta` `BidiGenerateContentConstrained` expectations on `realtimeInput` (`realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data } }` vs `realtimeInput: { mediaChunks: [...] }`) AND `realtimeInputConfig` / `inputAudioTranscription` in `liveConnectConstraints` (`apps/api/src/server.ts:92`)! Let `live-api-verify` skill / Gemini Live docs confirm current exact field shape if `mediaChunks` silently drops!
3. **Mute Button Doesn't Mute Live Mode (`apps/web/src/App.tsx:245`):**
   - `setMuted(!isMuted)` only updates Zustand `isMuted` (Orb label `"Muted"` + skips `speechSynthesis` in fallback). It does NOT mute `AudioCapture` or `AudioPlayer` in `LiveSession`.
4. **Compatibility Mode Gaps (`apps/api/src/server.ts:142` & `apps/web/src/App.tsx:100`):**
   - `POST /api/chat` doesn't pass `TOOL_DECLARATIONS` or run tools, and doesn't return `toolEvents` (so Cockpit/ActivityFeed/ActionPlan don't update in Compatibility mode).
   - `handleStartFallback` in `App.tsx:104` only sends `[ { role: 'user', text: transcript } ]` instead of accumulated conversation history.
5. **Reconnect Loses Options (`apps/web/src/live/LiveSession.ts:275`):**
   - `reconnect()` calls `this.start()` with empty `{}` instead of preserving `{ language, mode }` passed initially.
6. **Doc Drift & Unused Worklet File:**
   - `apps/web/public/audio-worklet.js` is no longer loaded by `capture.ts`.
   - `README.md` & `docs/NOTE_1PAGE.md` still describe `AudioWorklet` (sync to `ScriptProcessorNode` or revert `capture.ts` if AudioWorklet output-buffer fix is used instead).
7. **Incomplete Optional / Submission Tasks:**
   - `evals` (`apps/api/src/evals.ts`, `evals/run-evals.ts`): only runs 5 of 24 scenarios without tool passing or LLM judge scoring.
   - `T20` (Playwright E2E): not implemented.
   - `T22` (Deploy web + api): optional if submitting runnable repo + recording; currently local only.
   - `T23` (1–2 min screen recording): **NOT recorded yet** — highest urgency once voice works!

---

## 6. Key File Map

- **Core (`packages/core/src/`):** `types.ts`, `provider.ts`, `analytics.ts`, `recommend.ts`, `tools.ts`, `prompt.ts`, `index.ts`, `data/seller.mock.json`, `*.test.ts` (30 tests)
- **Backend (`apps/api/src/`):** `server.ts`, `server.test.ts` (5 tests), `evals.ts`, plus T01 probe scripts (`test-*.ts`, `check-bidi-models.ts`, `inspect-sdk.ts`)
- **Frontend (`apps/web/src/`):** `App.tsx`, `main.tsx`, `index.css`, `live/LiveSession.ts`, `live/toolBridge.ts`, `audio/capture.ts`, `audio/player.ts`, `audio/player.test.ts` (3 tests), `store/useCallStore.ts`, `components/{Header,StageTracker,Orb,Cockpit,Transcript,ActivityFeed,ActionPlanCard,AssumptionsDrawer}.tsx`, `public/audio-worklet.js` *(unused)*
- **Scripts & Evals:** `scripts/{debug-live.mjs,test-audio.mjs,test-gemini.mjs,handoff.mjs,handoff.sh}`, `evals/{run-evals.ts,run-evals.mjs,scenarios.json}`, `data/{seller.mock.json,scenarios.json}`
- **Docs:** `AGENTS.md`, `README.md`, `EXECUTION_PLAN.md`, `docs/{MASTER_PLAN.md,NOTE_1PAGE.md,DEMO_SCRIPT.md,CONTEXT.md,FULL_CONTEXT.md,HANDOFF.md,HANDOFF.auto.md,TASKS.md,SESSION_LOG.md,DECISIONS.md,REVIEW_CHECKLIST.md}`

---

## 7. Immediate Resume Checklist for Next Agent

> **Superseded (Session 12).** The live checklist now lives in **`docs/HANDOFF.md` -> "Resume prompt"**. The short version: never run `git` or `pnpm handoff`; start `:8080` and `:5173`; run `pnpm -r test` (84/84), `pnpm e2e:browser` (6/6), `pnpm e2e:plan` (7/7); hard-refresh the browser after any server-side change; then rehearse the turn-taking behaviour and capture the 1-2 min screen recording (`docs/DEMO_SCRIPT.md`).

1. **Never run any `git` commands** (strict user rule). Do not run `pnpm handoff` either (it shells out to `git`).
2. Start `:8080` API (`pnpm --filter api dev`) and confirm `:5173` web is active. **Restart the API after editing `apps/api/src/server.ts`** - the live config is baked into the ephemeral token.
3. Verify live 2-way voice + tool calling + barge-in + turn-taking in Chrome; the open question is whether Asha waits for the seller to finish (ADR-024, `docs/CONTEXT.md` section 7).
4. Run `pnpm -r test` + `pnpm -r build`, then help the user rehearse and capture the **1-2 min screen recording** (`docs/DEMO_SCRIPT.md`).

> The file map in section 6 above is the Session-6 snapshot. For the current inventory see `docs/CONTEXT.md` section 3 (the UI was rebuilt: `Orb.tsx`, `Cockpit.tsx` and `ActivityFeed.tsx` were replaced by `CallStage`, `VoiceCore`, `BusinessVitals`, `LossBridge` and `AgentTrace`).

