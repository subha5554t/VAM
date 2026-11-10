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

