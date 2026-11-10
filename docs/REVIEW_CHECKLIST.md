# REVIEW CHECKLIST (use in every self-review and by the independent critic agent)
**Correctness** — acceptance criteria met with evidence? tests green? numbers reconcile (400/270 orders, ₹2,00,000/₹1,35,000, cancels 32/38, OOS 5/18)?
**Voice UX** — first audio ≤ ~1.5 s? interruption flushes audio? turns ≤ 25 words? filler before tools? no silent gaps? language mirrored?
**Grounding** — any spoken number not from a tool result? any invented policy/commission/algorithm claim?
**Prompt/Conversation** — ≤3 questions? exactly 3 recommendations? corrects false seller beliefs? guardrails (off-topic, injection, escalation)?
**Resilience** — reconnect/resume/goAway? fallback mode switch? mic denied? tool timeout? quota 429?
**Security** — API key never in client/repo? ephemeral token single-use + locked config? CORS allow-list? rate limit? input validation? CSP?
**Code quality** — strict TS, Zod boundaries, no logic in components, no dead code, logs structured?
**Demo risk** — what is the single most likely thing to fail live? what is the mitigation?
**Context hygiene** — CONTEXT/TASKS/SESSION_LOG/DECISIONS/HANDOFF updated and committed?

