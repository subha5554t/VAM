# CONTEXT — living project state. Last updated: 2026-11-10T18:25:00+05:30 by Gemini 3.8 Flash

## 1. Goal & deadline
Voice-first Snapdeal Virtual KAM ("Asha"). Deadline 11 Nov 2026 11:15 AM IST (target submit 08:30). Deliver: URL + repo + 1–2 min recording + 1-page note.

## 2. Status snapshot
| Area | State | Evidence |
|---|---|---|
| Repo scaffold | done | pnpm workspaces (@kam/core, api, web), vitest tests pass across all packages, .env gitignored |
| Core analytics (bridge reconciles to ₹65,000 / 130 orders) | todo | |
| Tools + API | todo | |
| Ephemeral token session | todo | |
| Audio capture / playback / barge-in | todo | |
| Live session + tool bridge | todo | |
| UI (orb, transcript, cockpit, plan, summary) | todo | |
| Fallback mode | todo | |
| Proactive mode | todo | |
| Evals (24 scenarios) | todo | |
| Deploy | todo | |
| Recording / note / email | todo | |

## 3. Architecture snapshot
Browser (React) ⇄ Gemini Live (WebSocket, ephemeral token) ; tool calls → POST /api/tools/:name (Fastify) → packages/core analytics → data/seller.mock.json. Fallback: Web Speech → /api/chat (text LLM + same tools) → speechSynthesis.

## 4. Key facts
- Node: v20.20.2; pnpm: 8.15.1; `@google/genai`: ^3.0.0.
- Model IDs / env: GEMINI_LIVE_MODEL=gemini-2.0-flash-exp (to verify in T01), GEMINI_TEXT_MODEL=gemini-1.5-flash, VOICE_NAME=Aoede.
- Data: `data/seller.mock.json` (reconciled: Σorders 400/270, Σsales 200000/135000, cancels 32/38, OOS 5/18).
- Bridge (₹): stock-outs 23,085 · reduced promotions 18,570 · organic rank loss 23,345 = 65,000 (+≈3,000 extra cancellations in net lens).

## 5. Decisions (see DECISIONS.md)
- ADR-001: Native speech-to-speech (Gemini Live) primary, cascade fallback.
- ADR-002: Numbers only from deterministic tools in packages/core.
- ADR-003: Bridge valuation at SKU level reconciling exactly to ₹65,000.

## 6. Open questions / VERIFY list
- T01: Verify current Live API model ID and ephemeral token constraints with `@google/genai` v3.

## 7. Known issues / tech debt
- None so far.

## 8. How to run & test
See AGENTS.md §3. `pnpm install`, `pnpm -r test`, `pnpm handoff`.

## 9. NEXT STEP (single, concrete)
T01 — write and run Live API verification script in `scripts/verify-live.mjs` to test connection, model, voice, transcription, and toy tool call with GEMINI_API_KEY.
