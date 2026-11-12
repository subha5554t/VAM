# Snapdeal Voice KAM — "Asha"

> **A voice-first, agentic Virtual Key Account Manager web application for Snapdeal sellers experiencing sales declines.**  
> Built for the Snapdeal AI First Intern practical assignment.

---

## ⚡ Quickstart (Run in 3 Commands)

### Prerequisites
- **Node.js**: v20+
- **pnpm**: v8+ or v9+
- A Google Gemini API Key from [Google AI Studio](https://aistudio.google.com)

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment Variables
Create `.env` in the root directory (or copy `.env.example`):
```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_TEXT_MODEL=gemini-3.5-flash-lite
VOICE_NAME=Aoede
ALLOWED_ORIGINS=http://localhost:5173
PORT=8080
```

### 3. Start Development Servers
In two separate terminals:
```bash
# Terminal 1: Fastify Backend API (port 8080)
pnpm --filter api dev

# Terminal 2: React + Vite Web App (port 5173)
pnpm --filter web dev
```
Open **`http://localhost:5173`** in Google Chrome or Edge. Click **"Start Voice Call"** and speak to Asha!

---

## 🧪 Test & Evaluation Commands

```bash
# Run all unit and integration tests across monorepo (39 tests)
pnpm test

# Run LLM conversation evaluation suite (24 scenarios from data/scenarios.json)
pnpm evals

# Regenerate handoff snapshot
pnpm handoff
```

---

## 🏛️ System Architecture

```
[Browser Mic] ──(16 kHz PCM Worklet)──► [WebSocket] ◄──(24 kHz PCM)──► [Gemini Live S2S]
      │                                     │                                  │
      ▼                                     ▼ (tool calls)                     ▼
[UI Cockpit & Orb] ◄──(State / Transcript)── [Tool Bridge] ────► [Fastify /api/tools/:name]
                                                                        │
                                                              [packages/core Analytics]
                                                                        │
                                                              [seller.mock.json (60 SKUs)]
```

### Key Design Pillars
1. **Speech-to-Speech (S2S):** Powered by `gemini-3.8-live` over WebSocket with low-latency `ScriptProcessorNode` capture at the device's native rate, resampled in JS to 16 kHz PCM, and gapless 24 kHz Web Audio playback with instant barge-in interruption flushing.
2. **Natural Turn-Taking:** The server-side VAD ends the seller's turn only after **1000 ms** of silence, so a natural mid-sentence pause is not mistaken for "the seller finished". The system prompt carries an explicit turn-taking contract (wait through pauses, never fill silence, one speaker at a time, connectivity checks are not business answers), and the greeting gate holds the microphone until her audio has actually drained from the playback queue.
3. **Ephemeral Token Security:** Single-use tokens minted via `@google/genai` `authTokens.create`. Real API keys never reach the browser bundle.
4. **Deterministic Core / Probabilistic Shell:** The model never computes arithmetic or guesses numbers. All figures come from pure functions in `packages/core` over `seller.mock.json`.
5. **Resilience & Fallback:** Built-in auto-fallback mode ("Compatibility Mode") using Web Speech STT → Fastify text endpoint (`/api/chat`) with the same deterministic tools → browser `speechSynthesis`.

---

## 📊 Reconciled Business Analysis (Sharma Home Essentials | SD-48213)

| Metric | Last Month | This Month | Delta | Finding |
|---|---|---|---|---|
| **Gross Sales** | ₹2,00,000 | ₹1,35,000 | **−₹65,000 (−32.5%)** | Reconciles to the penny across 60 SKUs |
| **Orders** | 400 | 270 | **−130 orders (−32.5%)** | Volume drop across cookware & cleaning |
| **Out-of-Stock SKUs** | 5 | 18 | **+13 newly OOS** | 5 chronic dead listings + 13 new stockouts |
| **Cancellation Rate** | 8% (32 orders) | 14% (38 orders) | **+6% (+6 orders)** | 55% cancelled due to stock unavailable |
| **Average Selling Price** | ₹500 | ₹500 | **0% (Flat)** | **Pricing ruled out as the cause** |
| **Platform Impressions** | 1,20,000 | 84,000 | **−30%** | Search visibility penalized by cancellations |

### The ₹65,000 Revenue Bridge
1. **Newly Out-of-Stock Products (13 SKUs):** −51 orders = **−₹23,085 (35.5%)** (Top 4 products: Pressure Cooker KT-101, Tawa KT-118, Containers ST-204, Mop HM-310 represent 78% of stockout losses).
2. **Organic Rank & Visibility Loss (Impressions −30%):** −44 orders = **−₹23,345 (35.9%)**.
3. **Reduced Ad Spend (Cut ₹8,000 → ₹2,500):** −35 orders = **−₹18,570 (28.6%)**.
4. **Total Gross Sales Drop:** 51 + 44 + 35 = **130 orders = ₹65,000**.

---

## 🎯 Exactly 3 Prioritised Action Recommendations
1. **Restock Top 4 Hero SKUs First:** Procure 30 units of KT-101, 25 of KT-118, 20 of ST-204, and 20 of HM-310. Estimated cost: **₹27,565**. (If cash is tight, phase procurement by ROI starting with ST-204 and HM-310). Upside: **up to ₹18,000/month** (up to ₹23,000 once all 13 are back). Timeline: 5–7 days.
2. **Eliminate Post-Order Stock Cancellations & Fix Dispatch SLA:** Daily stock sync and 24h dispatch buffer. Bring cancellation rate from 14% back to <8% and dispatch breaches from 15% to <6%. Upside: **up to ₹23,000/month** in ranking recovery + ₹3,000 saved cancellations. Timeline: Immediate (2–4 weeks for full rating rebuild).
3. **Restart Targeted Ad Promotions on Recovered Best-Sellers:** Lift ad spend from ₹2,500 back to ₹8,000 (+₹5,500) once stock arrives. Upside: **up to ₹18,500/month** (~3.4× ROI). Timeline: Within 10 days of restock.

**Total Potential Recovery:** **up to ₹65,000/month** (realistic 60–74% execution = **₹39,000–₹48,000/month**).

---

## 📁 Repository Structure

```
snapdeal-voice-kam/
├── apps/
│   ├── api/                     # Fastify Backend API
│   │   ├── src/server.ts        # Healthz, /api/session (ephemeral tokens), /api/tools/:name, /api/chat
│   │   ├── src/evals.ts         # LLM scenario evaluation runner
│   │   └── src/server.test.ts   # API integration tests
│   └── web/                     # React + Vite + Tailwind Frontend
│       ├── public/audio-worklet.js # legacy, unused (capture uses ScriptProcessorNode)
│       ├── src/audio/           # Audio capture and gapless player
│       ├── src/live/            # Gemini Live WebSocket session & tool bridge
│       ├── src/store/           # Zustand call state store
│       └── src/components/      # CallStage, VoiceCore, Transcript, StageTracker, BusinessVitals, LossBridge, ActionPlanCard, AgentTrace, AssumptionsDrawer
├── packages/
│   └── core/                    # Pure Deterministic Business Brain
│       ├── src/types.ts         # Zod schemas (Seller, Sku, Metrics, ActionPlan, etc.)
│       ├── src/provider.ts      # DataProvider interface & MockSellerProvider
│       ├── src/analytics.ts     # Snapshot, Revenue Bridge, Ruled-out factors
│       ├── src/recommend.ts     # 3-action generator with ROI & cash-flow advice
│       ├── src/tools.ts         # 8 tool declarations & handlers
│       ├── src/prompt.ts        # System prompt builder (brevity, grounding, turn-taking, Hinglish/Hindi)
│       └── src/data/            # seller.mock.json
├── data/                        # Reconciled mock dataset & 24 eval scenarios
├── docs/                        # Architecture, Master Plan, Notes, Handoff & Session Logs
└── package.json                 # pnpm monorepo workspace scripts
```

---

## 📜 Assignment Documentation Links
- **[One-Page Technical Note](file:///c:/Users/VICTUS/Downloads/VAM/docs/NOTE_1PAGE.md)** — Models, voice technologies, and production roadmap.
- **[Demo Recording Script](file:///c:/Users/VICTUS/Downloads/VAM/docs/DEMO_SCRIPT.md)** — Step-by-step timed demo walk-through.
- **[Master Plan v2](file:///c:/Users/VICTUS/Downloads/VAM/docs/MASTER_PLAN.md)** — Complete architectural specification.

