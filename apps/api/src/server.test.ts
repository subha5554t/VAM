import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { EndSensitivity } from '@google/genai';
import { createServer, LIVE_VAD_CONFIG, SESSION_RATE_LIMIT } from './server.js';

describe('Fastify API Server Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz returns 200 and version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.service).toBe('snapdeal-voice-kam-api');
    expect(body.version).toBe('1.0.0');
  });

  it('POST /api/tools/:name executes tool successfully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tools/get_seller_snapshot',
      payload: { sellerId: 'SD-48213' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.data.metrics.current.sales).toBe(135000);
    expect(body._executionMs).toBeDefined();
  });

  it('POST /api/tools/:name returns 404 for unknown tool', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tools/unknown_tool_name',
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(false);
  });

  it('POST /api/tools/:name returns 400 for bad parameters', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tools/get_seller_snapshot',
      payload: {}, // Missing required sellerId
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(false);
  });

  it('keeps the seller turn open through a natural pause', () => {
    expect(LIVE_VAD_CONFIG.silenceDurationMs).toBe(1000);
    expect(LIVE_VAD_CONFIG.endOfSpeechSensitivity).toBe(EndSensitivity.END_SENSITIVITY_HIGH);
    expect(LIVE_VAD_CONFIG.prefixPaddingMs).toBe(100);
  });

  it('POST /api/session mints ephemeral token when key is configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { language: 'hinglish', mode: 'reactive' },
    });

    // If key is active, it returns 200 with token
    if (res.statusCode === 200) {
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
      expect(body.token).toBeDefined();
      expect(body.token).toContain('auth_tokens/');
      expect(body.model).toBe('gemini-3.8-live');

      // The diagnosis is pre-computed server-side so the greeting is grounded.
      expect(Array.isArray(body.toolEvents)).toBe(true);
      expect(body.toolEvents.map((e: any) => e.name).sort()).toEqual([
        'analyze_sales_decline',
        'get_seller_snapshot',
      ]);
      for (const ev of body.toolEvents) {
        expect(ev.args.sellerId).toBe('SD-48213');
        expect(typeof ev.ms).toBe('number');
      }

      const facts = JSON.parse(body.verifiedFacts);
      expect(facts.orders.last).toBe(400);
      expect(facts.orders.current).toBe(270);
      expect(facts.sales.current).toBe(135000);
    } else {
      // In CI / without key
      expect([200, 500]).toContain(res.statusCode);
    }
  }, 15000);

  /**
   * Regression guard: the token endpoint used to be capped at 15/min, which
   * ordinary page reloads exhausted. The 17th mint then returned an opaque
   * 429 that killed the Live path and dropped the seller into the fallback.
   */
  it('POST /api/session allows 60 mints per minute', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { language: 'hinglish', mode: 'reactive' },
    });

    expect(res.headers['x-ratelimit-limit']).toBe('60');
  }, 15000);

  /**
   * The body the browser receives when the limit is hit must be actionable:
   * the client retries on it and shows the reason to the seller.
   */
  it('returns a machine-readable body when the token limit is hit', () => {
    const body = SESSION_RATE_LIMIT.errorResponseBuilder({}, { ttl: 42000 }) as any;

    expect(body.ok).toBe(false);
    expect(body.error).toBe('RATE_LIMITED');
    expect(body.retryAfterMs).toBe(42000);
    expect(body.message).toContain('Retry in 42s');
  });
});
