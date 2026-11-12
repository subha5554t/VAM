# Demo Recording Script (Target: 90–110 Seconds)

**Goal:** Record a crisp, natural screen recording demonstrating voice interaction, natural turn-taking (she listens first, then answers), grounded tool calling, barge-in interruption, and action ownership.

## Pre-Recording Checklist
- [ ] Browser: Google Chrome full screen (1440x900).
- [ ] Audio: **Headset microphone** connected (prevents speaker echo — essential for the barge-in beat).
- [ ] Environment: Quiet room, notifications muted.
- [ ] Servers running: `pnpm --filter api dev` (:8080) and `pnpm --filter web dev` (:5173).
- [ ] **Hard-refresh** `http://localhost:5173` (Ctrl+Shift+R) so the new bundle and a **freshly minted** token load.
- [ ] Mic picker set to the headset. Console should show `started at 48000Hz` (or `44100Hz`) — **not** `16000Hz`.
- [ ] Screen layout (current UI): **Header** on top · **Left column** = `CallStage` (VoiceCore orb + state label, dark `Transcript` with the "I can hear you" badge, `StageTracker` strip, mic picker + live RMS bars) · **Right column** = `BusinessVitals` (+ `LossBridge`) and `ActionPlanCard` · **Bottom** = `AgentTrace` tool log.

---

## Timed Turn-by-Turn Script

| Timestamp | Speaker | Action / Spoken Dialogue | What the Screen Shows |
|---|---|---|---|
| **0:00 – 0:05** | **User** | Click **"Start Voice Call"**. Wait for the chip to read **"Voice session ready — click Start to speak"**, then click it and allow the mic. | VoiceCore orb goes `Ready to start` → `Connecting to Gemini Live` → `Listening to you`. Mode badge shows `Live S2S`. |
| **0:05 – 0:18** | **Asha (Bot)** | **The grounded greeting** — one bubble, ≤25 words, with a verified number and ONE question: *"Namaste Rajesh ji, main Asha hoon, aapki Snapdeal Virtual KAM. Aapke orders 400 se 270 ho gaye hain. Kya yeh stock out ki wajah se hua hai, ya koi aur issue hai?"* | One complete bot bubble in the dark `Transcript`. `BusinessVitals` shows **Sales ₹2,00,000 → ₹1,35,000**, **Orders 400 → 270**. `StageTracker` on *Diagnose*. |
| **0:18 – 0:32** | **User (Seller)** | **Speak one long sentence with a deliberate ~1 second pause in the middle:** *"Haan, stock out ki wajah se orders gir gaye hain… [1 s pause] …aur supplier ko payment karne mein dus din lag rahe hain."* | **This is the listening beat.** The seller bubble appears; Asha says **nothing** during the pause. The **"I can hear you"** badge flashes while you speak. She stays silent until your last clause — no interruption, no filler. |
| **0:32 – 0:45** | **Asha (Bot)** | **One filler, then the tools, then the findings — in a single breath:** *"Let me check your numbers… Aapke 18 products out of stock hone se sixty-five thousand rupees ka nuksan hua hai, aur visibility bhi kam hui hai."* | `AgentTrace` logs `get_seller_snapshot` → `analyze_sales_decline`. `LossBridge` breaks the ₹65,000 into **stock-outs ₹23,085 / promos ₹18,570 / rank ₹23,345**. `StageTracker` advances to *Deep dive*. **Only one filler — no filler→tool→filler→tool→findings chain.** |
| **0:45 – 0:55** | **Asha (Bot)** | *"Quick question, Rajesh ji — aap suppliers ko payment jaldi kar pa rahe hain?"* | VoiceCore orb `Asha is speaking`. `StageTracker` on *Deep dive*. |
| **0:55 – 1:08** | **User (Seller)** | *"Haan, haan, payment kar dunga. Aur mujhe seedha 3 actions batao."* | Seller bubble; badge pulses again. |
| **1:08 – 1:25** | **Asha (Bot)** | *"Theek hai. Aapke liye teen actions hain: ek, top 4 out-of-stock products restock karo — up to eighteen thousand rupees per month. Do, stock sync se cancellations roko — up to twenty-six thousand. Teen, best-sellers par promotion restart karo — up to eighteen thousand. Plan bana doon?"* | `AgentTrace` logs `advance_stage(recommend)` + `create_action_plan`. `ActionPlanCard` fills with **3 cards**, each showing title, `+up to ₹…/mo`, **owner** and **timeline**. **Average Price** card shows *"pricing ruled out"* (ASP flat). |
| **1:25 – 1:35** | **User (Seller)** | **Barge-in / interrupt:** *"Ruko, top 4 products kaunse hain?"* | **Barge-in beat:** Asha stops mid-sentence. Orb returns to `Listening to you`. |
| **1:35 – 1:45** | **Asha (Bot)** | *"Paanch litre cooker, 28 cm tawa, container set aur microfiber mop. Restock ka kharcha lagbhag twenty-sath thousand rupees."* | `AgentTrace` logs `get_out_of_stock_products`. Response is under 25 words and grounded in the tool. |
| **1:45 – 1:55** | **User (Seller)** | *"Theek hai, plan set kar do aur teen din baad check kar lena."* | Seller agrees. |
| **1:55 – 2:05** | **Asha (Bot)** | *"Done. Plan ban gaya aur Friday ko check-in schedule kar diya hai. Summary: top four restock karo, cancellations fix karo, phir promotion. Aur kuch?"* | `AgentTrace` logs `create_action_plan` + `schedule_followup`. `ActionPlanCard` shows the **follow-up badge**. `StageTracker` on *Summary*. |
| **2:05 – 2:15** | **User** | Click **"End Conversation"**, then **"Download Summary (.md)"** in the Action Plan card. | Downloads `Snapdeal-KAM-Summary-SD-48213-….md`. Proves end-to-end ownership. Optional final beat: open the **Assumptions** drawer in the header (A1–A9) for 2 seconds. |

---

## Recording Notes / Failure Recovery

- **Asha must not talk over you.** If she answers during your 1 s pause in the 0:18–0:32 beat, the demo's core claim fails. Note the exact timestamp and report it — the fix is `LIVE_VAD_CONFIG.silenceDurationMs` (900–1200 ms) in `apps/api/src/server.ts`; **restart the API and hard-refresh the browser** after changing it.
- **If a seller bubble appears late**, that is transcription timing, not proof she did not hear you. `interimInputTranscription` is not implemented yet, so the final bubble lands after the turn.
- **If the greeting is truncated** (one bubble but cut mid-sentence), use headphones and check that no laptop speaker echo is in the room.
- **If a tool call does not fire**, check `AgentTrace` at the bottom before changing anything — `create_action_plan` is model-driven and non-deterministic.
- **Do not retake over upstream latency.** If the greeting takes >20 s to arrive, that is Google's token mint; keep the recording and trim the wait.
- **One clean take is enough.** If a beat fails, restart the call (not the servers) and keep going — the tool log and the dashboard still tell the story.
