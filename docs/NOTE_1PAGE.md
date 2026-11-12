# Snapdeal Virtual KAM — "Asha" (One-Page Technical Note)

**Candidate Submission:** Mini AI Voice Key Account Manager for Snapdeal  
**Primary Voice Engine:** Google Gemini Live API (`gemini-3.8-live` via WebSocket)  
**Fallback Engine:** Web Speech STT → Gemini 3.5 Flash-Lite (Deterministic Tools) → SpeechSynthesis TTS  
**Architecture:** Client-to-Server with Locked Ephemeral Tokens + Fastify Backend + React Cockpit  

---

## 1. What It Does
"Asha" is a voice-first, autonomous Virtual Key Account Manager (Virtual KAM) that assists Snapdeal sellers when their sales drop. Unlike passive chatbots that merely answer queries, Asha actively takes ownership:
1. **Listens & Understands:** Greets the seller warmly in their chosen language (English, Hindi, or natural Hinglish), then **waits for them to finish** — including mid-sentence pauses — before responding.
2. **Diagnoses with Tools:** Automatically invokes deterministic server-side tools over seller data rather than guessing numbers.
3. **Rules Out False Hypotheses:** Uses data to politely correct seller misconceptions (e.g. proves average selling price remained flat at ₹500, ruling out pricing as the cause).
4. **Recommends Exactly 3 Prioritised Actions:** Restocks top 4 high-velocity products first with cash-flow-aware supplier costs (₹27,565), eliminates post-order stock cancellations, and restarts hero promotions.
5. **Drives Commitment:** Creates a persistent action plan, schedules an automated 3-day follow-up, and can proactively initiate calls when sales anomalies are detected.

---

## 2. Models & Voice Technologies Used
- **Primary Speech-to-Speech (S2S):** **Google Gemini Live API (`gemini-3.8-live` on `v1beta`)**. Audio is streamed over a persistent bidirectional WebSocket: microphone audio is captured at the device's native rate with a browser `ScriptProcessorNode`, resampled in JS to **16 kHz PCM mono**, while model responses stream as **24 kHz PCM**, scheduled gaplessly on Web Audio API `AudioBufferSourceNode`s.
- **Turn-Taking (she listens first):** The server-side VAD ends the seller's turn only after **1000 ms** of silence (`silenceDurationMs`), so a natural mid-sentence pause is not mistaken for "the seller finished". On top of that, the system prompt carries an explicit **TURN-TAKING** contract: wait through pauses and never fill the silence, one speaker at a time, and greetings/connectivity checks ("can you hear me?") are answered in one short sentence and the question is repeated — they never trigger a tool call or advance the workflow. The greeting gate additionally holds the microphone until her audio has actually **drained** from the playback queue, so her own trailing words are never captured as a seller turn.
- **Barge-In (Interruption Handling):** When the seller interrupts mid-sentence, the server emits an `interrupted` signal and the client instantly flushes the playback buffer (<100 ms latency).
- **Fallback Compatibility Mode:** For browsers without WebSocket audio or during network/quota limitations, an automatic cascade engages: browser `webkitSpeechRecognition` captures speech, sends it to Fastify `POST /api/chat` with tool execution, and speaks the reply via `window.speechSynthesis`.

---

## 3. System Architecture & Workflow
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
1. **Security & Ephemeral Tokens:** The frontend never sees the master `GEMINI_API_KEY`. The Fastify backend mints single-use ephemeral tokens (`ai.authTokens.create`, `uses: 1`, `expireTime: +30m`) with server-locked `systemInstruction`, function declarations **and** the live audio/endpointing config — the browser's `setup` message cannot override it.
2. **Deterministic Core / Probabilistic Shell:** The LLM narrates; **tools calculate**. Spoken figures strictly derive from tool outputs over `seller.mock.json`.
3. **Turn Brevity:** System instructions strictly cap turns at **≤25 words**, require filler lines before tool calls ("Let me check your numbers..."), and enforce one question at a time.

---

## 4. Reconciled Data & Mathematical Revenue Bridge
Based on the sample seller (Rajesh Sharma, Sharma Home Essentials, Kanpur | SD-48213):
- **Gross Sales:** ₹2,00,000 → ₹1,35,000 (**−₹65,000 / −32.5%**).
- **Orders:** 400 → 270 (**−130 orders / −32.5%**). ASP is exactly **₹500** both months.
- **Out of Stock:** 5 → 18 SKUs (5 chronic dead listings + 13 newly out of stock).
- **Cancellations:** 8% → 14% (32 → 38 orders). 55% were due to stock unavailable post-order; dispatch SLA breaches rose 6% → 15%, dropping seller rating from 4.2 to 4.0.
- **The ₹65,000 Revenue Bridge (Exact SKU calculation):**
  - **Newly Out-of-Stock SKUs (13 items):** 51 orders lost = **₹23,085 (35.5%)** (Top 4 products represent ₹18,078 = 78% of stockout losses).
  - **Reduced Promotions (Ad spend cut ₹8,000 → ₹2,500):** 35 orders lost = **₹18,570 (28.6%)**.
  - **Organic Rank & Visibility Loss (Impressions −30%):** 44 orders lost = **₹23,345 (35.9%)**.
  - **Total Reconciled Drop:** 51 + 35 + 44 = **130 orders** = **₹65,000**.

---

## 5. Documented Assumptions (Brief Compliance)
- **A1–A2:** 60 active catalogue SKUs; 13 newly OOS items generated 72 orders last month (4 in the top-10: KT-101 Cooker, KT-118 Tawa, ST-204 Containers, HM-310 Mop).
- **A3–A5:** Traffic dropped 30% (1,20,000 to 84,000 impressions) with flat conversion (0.33% to 0.32%); late dispatches rose from 6% to 15%.
- **A6–A8:** Algorithm search ranking penalizes stockouts/cancellations; ad budget was cut to conserve operating cash due to **~₹1.2 lakh pending supplier dues**; supplier restock lead times are 5–7 days.

---

## 6. Production Scalability Path
To scale to thousands of Snapdeal sellers:
1. **SIP / Telephony Bridge:** Connect Exotel/Twilio/LiveKit SIP trunks to the existing Live WebSocket session.
2. **Real Data Layer:** Swap `MockSellerProvider` with Snapdeal Seller APIs behind the existing `DataProvider` interface.
3. **Redis Session Persistence:** Store session resumption handles in Redis for cross-server reconnects.

