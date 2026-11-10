---
name: live-api-verify
description: Before writing or changing any Gemini Live API code (models, ephemeral tokens, config fields, tools, session resumption), verify against current official docs to avoid outdated SDKs and invented model IDs.
---
# live-api-verify
1. Query the `geminiDocs` MCP (`gemini_search_docs`, `gemini_get_doc`) or fetch `https://ai.google.dev/gemini-api/docs/llms.txt` and the Live API pages (get-started, tools, session-management, ephemeral-tokens, best-practices).
2. Confirm: model ID (use env, current docs show `gemini-3.8-live`), SDK (`@google/genai`), ephemeral-token endpoint (`...BidiGenerateContentConstrained?access_token=`), audio formats (in 16 kHz PCM, out 24 kHz), tool-calling mode (sync vs NON_BLOCKING) for the chosen model, session limits (compression/resumption/goAway).
3. Compare with the official example `google-gemini/gemini-live-api-examples` (`gemini-live-ephemeral-tokens-websocket`).
4. Write findings into `docs/CONTEXT.md → Key facts`; mark anything unverified `VERIFY`.

