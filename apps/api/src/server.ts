import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import {
  GoogleGenAI,
  Modality,
  StartSensitivity,
  EndSensitivity,
  ActivityHandling,
  TurnCoverage,
} from '@google/genai';
import {
  executeTool,
  TOOL_DECLARATIONS,
  buildSystemPrompt,
  SupportedLanguage,
  ConversationMode,
} from '@kam/core';

// Load .env from workspace root or current dir
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

export const API_VERSION = '1.0.0';

/**
 * Live API endpointing. 500 ms with END_SENSITIVITY_HIGH cut normal Hinglish
 * thinking pauses mid-sentence, so Asha answered before the seller finished.
 * 1000 ms keeps the turn open through a natural pause while staying well below
 * Google's 2000 ms+ "feels sluggish" range. Tune within 900-1200 ms.
 */
export const LIVE_VAD_CONFIG = {
  startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
  // Keep HIGH for now: the longer silence window is the direct fix. If pauses
  // are still cut off, try END_SENSITIVITY_LOW; it can hang on noisy inputs.
  endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
  // prefixPaddingMs:0 clips word onsets ("Namaste" -> "aste"). 100 ms keeps
  // the first syllable without adding perceptible lag.
  prefixPaddingMs: 100,
  silenceDurationMs: 1000,
};

/** Seller under review for this assignment. */
const SELLER_ID = 'SD-48213';

/**
 * Warm GoogleGenAI clients, one per (apiKey, apiVersion) pair. Creating a new
 * client per request forces a fresh TLS handshake to Google, which showed up
 * as ~6s cold latency on the first /api/session call.
 *
 * The previous implementation rebuilt the client on every call whenever an
 * apiVersion was supplied (`|| apiVersion` is always truthy), so /api/session
 * paid a new handshake for every ephemeral token it minted.
 */
const aiClients = new Map<string, GoogleGenAI>();

function getAi(apiKey: string, apiVersion?: string): GoogleGenAI {
  const cacheKey = `${apiVersion ?? 'default'}|${apiKey}`;
  const cached = aiClients.get(cacheKey);
  if (cached) return cached;

  const ai = new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { httpOptions: { apiVersion } } : {}),
  });
  aiClients.set(cacheKey, ai);
  return ai;
}

export interface WarmupToolEvent {
  type: 'tool';
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  ms: number;
}

/**
 * Runs the two diagnostic tools server-side BEFORE the token is minted so the
 * very first spoken sentence can be grounded in real tool output instead of
 * costing the seller a 2-4s tool round-trip of dead air.
 *
 * The same results are returned to the browser so the Cockpit and Agent
 * Activity Feed are populated the moment the call connects.
 *
 * The tools are pure functions over static mock data, so the result is
 * memoised: minting a token must not re-derive the diagnosis every time.
 */
let verifiedFactsCache: { facts: string; toolEvents: WarmupToolEvent[] } | null = null;

async function computeVerifiedFacts(): Promise<{ facts: string; toolEvents: WarmupToolEvent[] }> {
  if (verifiedFactsCache) return verifiedFactsCache;

  const names = ['get_seller_snapshot', 'analyze_sales_decline'] as const;
  const args = { sellerId: SELLER_ID };
  const toolEvents: WarmupToolEvent[] = [];

  const results = await Promise.all(
    names.map(async (name) => {
      const t0 = performance.now();
      const res = await executeTool(name, args);
      const ms = Math.round(performance.now() - t0);
      toolEvents.push({ type: 'tool', name, args, result: res.data ?? res.error, ms });
      return { name, res };
    })
  );

  const snap = results.find((r) => r.name === 'get_seller_snapshot')?.res.data;
  const analysis = results.find((r) => r.name === 'analyze_sales_decline')?.res.data;

  if (!snap || !analysis) {
    verifiedFactsCache = { facts: '', toolEvents };
    return verifiedFactsCache;
  }

  const facts = {
    seller: `${snap.business} (${snap.sellerId})`,
    sales: { last: snap.metrics.last.sales, current: snap.metrics.current.sales, changePct: snap.deltas.salesPct },
    orders: { last: snap.metrics.last.orders, current: snap.metrics.current.orders, changePct: snap.deltas.ordersPct },
    outOfStock: { last: snap.metrics.last.outOfStock, current: snap.metrics.current.outOfStock },
    cancellationRate: {
      lastPct: Number((snap.metrics.last.cancellationRate * 100).toFixed(1)),
      currentPct: Number((snap.metrics.current.cancellationRate * 100).toFixed(1)),
    },
    asp: { current: snap.metrics.current.asp, changePct: snap.deltas.aspPct },
    totalMonthlyLossRupees: analysis.bridge.totalLossRupees,
    topCauses: analysis.causes.map((c: any) => ({
      label: c.label,
      sharePct: c.sharePct,
      lossRupees: c.lossRupees,
    })),
    top4OutOfStockSkus: ['KT-101', 'KT-118', 'ST-204', 'HM-310'],
    ruledOut: analysis.ruledOut.map((r: any) => r.label),
  };

  const factsJson = JSON.stringify(facts, null, 2);

  verifiedFactsCache = { facts: factsJson, toolEvents };
  return verifiedFactsCache;
}

function languageCodeFor(lang: SupportedLanguage): string {
  if (lang === 'hi') return 'hi-IN';
  return 'en-IN';
}

/**
 * Rate limit for the ephemeral-token endpoint.
 *
 * A demo has exactly one seller. The previous ceiling of 15/min was reachable
 * by ordinary page reloads (every mount pre-warms a token) and the client only
 * saw an opaque "Too Many Requests" that killed the Live path and dropped the
 * seller into the fallback.
 *
 * `errorResponseBuilder` makes the refusal machine-readable so the browser can
 * retry and explain itself instead of guessing.
 */
export const SESSION_RATE_LIMIT = {
  max: 60,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req: unknown, context: { ttl: number }) => ({
    ok: false,
    error: 'RATE_LIMITED',
    message: `Token server busy. Retry in ${Math.ceil(context.ttl / 1000)}s.`,
    retryAfterMs: context.ttl,
  }),
};

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  // CORS allow-list
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173'
  )
    .split(',')
    .map((o) => o.trim());

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // Rate Limiting
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  // Health check endpoint
  app.get('/healthz', async () => {
    return {
      ok: true,
      service: 'snapdeal-voice-kam-api',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    };
  });

  // Ephemeral Token Minting Endpoint (Task T07)
  app.post(
    '/api/session',
    {
      config: {
        rateLimit: SESSION_RATE_LIMIT,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body || {}) as {
        language?: SupportedLanguage;
        mode?: ConversationMode;
        /** Session resumption handle from a previous goAway/expiry. */
        resumeHandle?: string;
      };

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return reply.status(500).send({
          ok: false,
          error: 'GEMINI_API_KEY is not configured on the server.',
        });
      }

      const language = body.language || 'hinglish';
      const mode = body.mode || 'reactive';
      const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';
      const voiceName = process.env.VOICE_NAME || 'Aoede';
      const mintStartedAt = Date.now();

      try {
        // Ground the opening sentence in real tool output (no dead air).
        const { facts, toolEvents } = await computeVerifiedFacts();

        const prompt = buildSystemPrompt({
          language,
          mode,
          verifiedFacts: facts,
        });

        // Ephemeral tokens are documented on v1beta, which is also the version
        // the browser connects to. Minting on v1alpha worked but was never
        // guaranteed to stay compatible.
        const ai = getAi(apiKey, 'v1beta');

        // NOTE: with ephemeral tokens the server-side `liveConnectConstraints`
        // is authoritative — the browser's `setup` message cannot override
        // these fields. Everything the session needs must live here.
        const token = await ai.authTokens.create({
          config: {
            uses: 1,
            expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            // Allows the browser to pre-warm a token on page load and consume
            // it when the seller actually clicks "Start Voice Call".
            newSessionExpireTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            liveConnectConstraints: {
              model: liveModel,
              config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: { parts: [{ text: prompt }] },
                tools: [{ functionDeclarations: TOOL_DECLARATIONS as any }],
                // Both transcripts are required for the on-screen transcript.
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                  languageCode: languageCodeFor(language),
                },
                realtimeInputConfig: {
                  automaticActivityDetection: LIVE_VAD_CONFIG,
                  activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
                  // Gemini 3.8 Live defaults to this. Forcing
                  // TURN_INCLUDES_ONLY_ACTIVITY measurably delayed the user
                  // transcript (11.7s vs 4.9s on identical audio).
                  turnCoverage: TurnCoverage.TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO,
                },
                sessionResumption: body.resumeHandle ? { handle: body.resumeHandle } : {},
                contextWindowCompression: { slidingWindow: {} },
              },
            },
          },
        });

        app.log.info(
          { ms: Date.now() - mintStartedAt, model: liveModel, mode, language },
          'ephemeral token minted'
        );

        return {
          ok: true,
          token: token.name,
          model: liveModel,
          apiVersion: 'v1beta',
          voiceName,
          verifiedFacts: facts,
          toolEvents,
        };
      } catch (err: any) {
        app.log.error(
          { err, ms: Date.now() - mintStartedAt, model: liveModel },
          'Failed to mint ephemeral token'
        );
        return reply.status(500).send({
          ok: false,
          error: 'MINT_FAILED',
          message: `Failed to mint ephemeral token: ${err.message || err}`,
        });
      }
    }
  );

  // Tool Execution Route (Task T06)
  app.post('/api/tools/:name', async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    const { name } = request.params;
    const args = request.body || {};

    const t0 = performance.now();
    const result = await executeTool(name, args);
    const durationMs = Math.round(performance.now() - t0);

    if (!result.ok) {
      if (result.error?.includes('Unknown tool')) {
        return reply.status(404).send(result);
      }
      return reply.status(400).send(result);
    }

    return {
      ...result,
      _executionMs: durationMs,
    };
  });

  // Fallback Text LLM Chat Turn (Task T16)
  // Mirrors the Live session: same system prompt, same tool declarations, and
  // a real tool-execution loop so figures stay tool-derived in both modes.
  app.post('/api/chat', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      messages: Array<{ role: 'user' | 'model'; text: string }>;
      language?: SupportedLanguage;
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return reply.status(500).send({ ok: false, error: 'GEMINI_API_KEY missing' });
    }

    const textModel = process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite';
    const language = body.language || 'hinglish';
    const systemPrompt = buildSystemPrompt({ language });

    const toolEvents: WarmupToolEvent[] = [];

    try {
      const ai = getAi(apiKey);

      const contents: any[] = (body.messages || []).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      }));

      let finalText = '';

      // Max 4 hops so a misbehaving model cannot loop forever.
      for (let hop = 0; hop < 4; hop++) {
        const response = await ai.models.generateContent({
          model: textModel,
          contents,
          config: {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: TOOL_DECLARATIONS as any }],
          },
        });

        const functionCalls = response.functionCalls || [];
        if (functionCalls.length === 0) {
          finalText = response.text?.trim() || '';
          break;
        }

        // Echo the model's tool-call turn back verbatim. Gemini 3.x rejects
        // reconstructed functionCall parts because the `thoughtSignature`
        // attached to each part must be preserved.
        const modelParts = response.candidates?.[0]?.content?.parts || [];
        contents.push({
          role: 'model',
          parts:
            modelParts.length > 0
              ? modelParts
              : functionCalls.map((fc) => ({ functionCall: fc })),
        });

        const responseParts: any[] = [];
        for (const fc of functionCalls) {
          const args: any = { ...(fc.args || {}) };
          if (!args.sellerId && fc.name !== 'advance_stage') {
            args.sellerId = SELLER_ID;
          }

          const t0 = performance.now();
          const result = await executeTool(fc.name as string, args);
          const ms = Math.round(performance.now() - t0);

          toolEvents.push({
            type: 'tool',
            name: fc.name as string,
            args,
            result: result.data ?? result.error,
            ms,
          });

          responseParts.push({
            functionResponse: {
              id: fc.id,
              name: fc.name,
              response: { result: result.data ?? { error: result.error } },
            },
          });
        }

        contents.push({ role: 'user', parts: responseParts });
      }

      return {
        ok: true,
        reply: finalText || 'Let me help you with your Snapdeal store.',
        toolEvents,
      };
    } catch (err: any) {
      return reply.status(500).send({ ok: false, error: err.message || 'Chat generation failed' });
    }
  });

  return app;
}

// Standalone execution
if (process.env.NODE_ENV !== 'test') {
  const port = parseInt(process.env.PORT || '8080', 10);
  createServer().then((app) => {
    // Bind dual-stack. Vite serves on ::1 and proxies /api, so an IPv4-only
    // listener made every proxied request race a refused IPv6 connection.
    app.listen({ port, host: '::' }, (err, address) => {
      if (!err) {
        console.log(`API server listening on ${address}`);
        return;
      }
      // Some Windows configurations disable IPv6 entirely.
      console.warn(`Dual-stack listen failed (${err.message}); falling back to 0.0.0.0`);
      app.listen({ port, host: '0.0.0.0' }, (fallbackErr, fallbackAddress) => {
        if (fallbackErr) {
          console.error(fallbackErr);
          process.exit(1);
        }
        console.log(`API server listening on ${fallbackAddress}`);
      });
    });
  });
}
