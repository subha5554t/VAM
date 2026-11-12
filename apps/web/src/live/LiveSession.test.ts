import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * These tests pin the exact WebSocket wire format against the Live API.
 * Regression they guard against: `realtimeInput.mediaChunks` is deprecated and
 * silently dropped by gemini-3.8-live, which made Asha completely deaf.
 */

const h = vi.hoisted(() => ({
  capture: {
    onFrame: undefined as undefined | ((b: ArrayBuffer) => void),
    onVolume: undefined as undefined | ((v: number) => void),
    onDiagnostics: undefined as undefined | ((d: any) => void),
    options: undefined as undefined | { deviceId?: string; relaxed?: boolean },
    started: 0,
    active: false,
  },
  player: {
    playing: false,
    instance: undefined as undefined | { onDrain?: () => void },
  },
}));

vi.mock('../audio/capture.js', () => ({
  AudioCapture: class {
    async start(
      onFrame: (b: ArrayBuffer) => void,
      onVolume?: (v: number) => void,
      onDiagnostics?: (d: any) => void,
      options?: { deviceId?: string; relaxed?: boolean }
    ) {
      h.capture.onFrame = onFrame;
      h.capture.onVolume = onVolume;
      h.capture.onDiagnostics = onDiagnostics;
      h.capture.options = options;
      h.capture.active = true;
      h.capture.started++;
    }
    isActive() {
      return h.capture.active;
    }
    stop() {
      h.capture.active = false;
    }
    getDiagnostics() {
      return {
        rms: 0,
        sampleRate: 48000,
        deviceLabel: 'test',
        deviceId: 'test-mic',
        trackState: 'live',
        trackMuted: false,
        isCapturing: true,
      };
    }
  },
}));

vi.mock('../audio/player.js', () => ({
  AudioPlayer: class {
    onDrain?: () => void;

    constructor() {
      h.player.instance = this;
      h.player.playing = false;
    }

    enqueue() {
      h.player.playing = true;
    }

    flush() {
      h.player.playing = false;
    }

    setMute() {}

    isPlaying() {
      return h.player.playing;
    }

    destroy() {
      h.player.playing = false;
    }
  },
}));

import { LiveSession } from './LiveSession.js';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING as number;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  triggerMessage(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }

  get messages() {
    return this.sent.map((s) => JSON.parse(s));
  }
}

function makeFetchMock(toolEvents: unknown[] = []) {
  return vi.fn(async (url: string | URL, init?: any) => {
    const u = String(url);

    if (u.endsWith('/api/session')) {
      const body = JSON.parse(init?.body || '{}');
      return {
        json: async () => ({
          ok: true,
          token: 'minted-token',
          model: 'gemini-3.8-live',
          apiVersion: 'v1beta',
          toolEvents,
          echoedResumeHandle: body.resumeHandle ?? null,
        }),
      };
    }

    if (u.includes('/api/tools/')) {
      const name = u.split('/api/tools/')[1];
      return {
        json: async () => ({ ok: true, data: { name, currentStage: 'diagnose' }, _executionMs: 1 }),
      };
    }

    throw new Error(`Unexpected fetch: ${u}`);
  });
}

const settle = () => new Promise((r) => setTimeout(r, 10));

describe('LiveSession wire protocol', () => {
  let ws: MockWebSocket;

  const callbacks = () => ({
    onStateChange: vi.fn(),
    onUserTranscript: vi.fn(),
    onBotTranscript: vi.fn(),
    onToolEvent: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
    onTurnComplete: vi.fn(),
    onDiagnostics: vi.fn(),
    onVoiceActivity: vi.fn(),
  });

  beforeEach(() => {
    MockWebSocket.instances = [];
    h.capture.onFrame = undefined;
    h.capture.onVolume = undefined;
    h.capture.onDiagnostics = undefined;
    h.capture.options = undefined;
    h.capture.started = 0;
    h.capture.active = false;
    h.player.playing = false;
    h.player.instance = undefined;
    vi.stubGlobal('WebSocket', MockWebSocket);
    global.fetch = makeFetchMock() as any;
  });

  async function openSession(cb = callbacks()) {
    const session = new LiveSession(cb);
    await session.start({ language: 'en', mode: 'reactive' });
    ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws.triggerOpen();
    ws.triggerMessage({ setupComplete: {} });
    return { session, cb };
  }

  it('connects to the constrained v1beta endpoint', async () => {
    await openSession();
    expect(ws.url).toContain('BidiGenerateContentConstrained');
    expect(ws.url).toContain('v1beta');
    expect(ws.url).toContain('access_token=minted-token');
  });

  it('sends only a minimal setup message', async () => {
    await openSession();
    expect(ws.messages[0]).toEqual({ setup: { model: 'models/gemini-3.8-live' } });
  });

  it('triggers the greeting on setupComplete without mentioning numbers', async () => {
    await openSession();
    const greeting = ws.messages[1];
    const text = greeting.clientContent.turns[0].parts[0].text as string;
    expect(text.toLowerCase()).toContain('grounded greeting');
    // The trigger must not inject figures of its own.
    expect(text).not.toMatch(/\d/);
  });

  it('streams microphone audio as realtimeInput.audio (never mediaChunks)', async () => {
    await openSession();
    expect(h.capture.onFrame).toBeTypeOf('function');

    // The greeting owns the first turn; complete it to open the mic gate.
    ws.triggerMessage({ serverContent: { turnComplete: true } });

    h.capture.onFrame!(new Int16Array([1, 2, 3, 4]).buffer);

    const frame = ws.messages.find((m) => m.realtimeInput && m.realtimeInput.audio);
    expect(frame).toBeDefined();
    expect(frame.realtimeInput.audio.mimeType).toBe('audio/pcm;rate=16000');
    expect(typeof frame.realtimeInput.audio.data).toBe('string');

    const legacy = ws.messages.find((m) => m.realtimeInput?.mediaChunks);
    expect(legacy).toBeUndefined();
  });

  it('holds mic frames during the greeting so Asha cannot cut herself off', async () => {
    await openSession();
    const before = ws.sent.length;

    h.capture.onFrame!(new Int16Array([1, 2]).buffer);
    expect(ws.sent.length).toBe(before);

    ws.triggerMessage({ serverContent: { turnComplete: true } });
    h.capture.onFrame!(new Int16Array([3, 4]).buffer);
    expect(ws.messages.some((m) => m.realtimeInput?.audio)).toBe(true);
  });

  it('keeps the mic closed until the greeting audio actually drains', async () => {
    const { session } = await openSession();

    ws.triggerMessage({
      serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] } },
    });
    expect(h.player.playing).toBe(true);

    // The server can finish generating before playback has finished.
    ws.triggerMessage({ serverContent: { turnComplete: true } });

    const before = ws.sent.length;
    h.capture.onFrame!(new Int16Array([1, 2]).buffer);
    expect(ws.sent.length).toBe(before);

    // Natural end of the queued audio releases the gate.
    h.player.playing = false;
    h.player.instance?.onDrain?.();

    h.capture.onFrame!(new Int16Array([3, 4]).buffer);
    expect(ws.messages.some((m) => m.realtimeInput?.audio)).toBe(true);

    await new Promise((r) => setTimeout(r, 350));
    expect(session.getState()).toBe('listening');

    session.stop();
  });

  it('forwards server voice-activity events for the "I can hear you" badge', async () => {
    const { cb } = await openSession();

    ws.triggerMessage({ voiceActivity: { type: 'ACTIVITY_START', audioOffset: '0.240s' } });
    ws.triggerMessage({ voiceActivity: { type: 'ACTIVITY_END', audioOffset: '2.720s' } });

    expect(cb.onVoiceActivity).toHaveBeenNthCalledWith(1, {
      type: 'start',
      audioOffset: '0.240s',
    });
    expect(cb.onVoiceActivity).toHaveBeenNthCalledWith(2, {
      type: 'end',
      audioOffset: '2.720s',
    });
  });

  it('stops forwarding mic frames when muted and signals audioStreamEnd', async () => {
    const { session } = await openSession();
    // Greeting finished: the mic gate must be open before we test mute.
    ws.triggerMessage({ serverContent: { turnComplete: true } });
    const before = ws.sent.length;

    session.setMuted(true);

    const endMsg = ws.messages[ws.messages.length - 1];
    expect(endMsg.realtimeInput.audioStreamEnd).toBe(true);

    h.capture.onFrame!(new Int16Array([5, 6]).buffer);
    expect(ws.sent.length).toBe(before + 1); // only the audioStreamEnd message

    session.setMuted(false);
    h.capture.onFrame!(new Int16Array([7, 8]).buffer);
    expect(ws.sent.length).toBe(before + 2);
  });

  it('executes tool calls through the backend and replies with toolResponse', async () => {
    const { cb } = await openSession();

    ws.triggerMessage({
      toolCall: {
        functionCalls: [{ id: 'call-1', name: 'get_seller_snapshot', args: {} }],
      },
    });

    await settle();

    expect(cb.onToolEvent).toHaveBeenCalledTimes(1);
    expect(cb.onToolEvent.mock.calls[0][0].name).toBe('get_seller_snapshot');
    // sellerId must be injected by the client when the model omits it.
    expect(cb.onToolEvent.mock.calls[0][0].args.sellerId).toBe('SD-48213');

    const response = ws.messages.find((m) => m.toolResponse);
    expect(response).toBeDefined();
    expect(response.toolResponse.functionResponses[0].id).toBe('call-1');
    expect(response.toolResponse.functionResponses[0].response.result).toBeDefined();
  });

  it('emits the pre-computed tool events returned by /api/session', async () => {
    const cb = callbacks();
    global.fetch = makeFetchMock([
      { type: 'tool', name: 'get_seller_snapshot', args: { sellerId: 'SD-48213' }, result: { metrics: {} }, ms: 1 },
    ]) as any;

    const session = new LiveSession(cb);
    await session.start({ language: 'en' });

    expect(cb.onToolEvent).toHaveBeenCalledTimes(1);
    expect(cb.onToolEvent.mock.calls[0][0].name).toBe('get_seller_snapshot');
  });

  it('switches to "speaking" when audio arrives and marks the turn complete', async () => {
    const { session, cb } = await openSession();

    ws.triggerMessage({
      serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] } },
    });
    expect(cb.onStateChange).toHaveBeenCalledWith('speaking');

    ws.triggerMessage({ serverContent: { turnComplete: true } });
    expect(cb.onTurnComplete).toHaveBeenCalled();

    session.stop();
  });

  it('forwards both transcripts', async () => {
    const { cb } = await openSession();

    ws.triggerMessage({ serverContent: { inputTranscription: { text: 'Namaste' } } });
    ws.triggerMessage({ serverContent: { outputTranscription: { text: 'Hello ji' } } });

    expect(cb.onUserTranscript).toHaveBeenCalledWith('Namaste');
    expect(cb.onBotTranscript).toHaveBeenCalledWith('Hello ji');
  });

  it('passes the selected microphone into the capture layer', async () => {
    const session = new LiveSession(callbacks());
    await session.start({ language: 'en', mode: 'reactive', micDeviceId: 'mic-42' });
    await settle();

    expect(h.capture.options?.deviceId).toBe('mic-42');
    expect(h.capture.options?.relaxed).toBe(false);
  });

  it('starts capture with processing off when the relaxed preference is set', async () => {
    const session = new LiveSession(callbacks());
    await session.start({
      language: 'en',
      mode: 'reactive',
      micDeviceId: 'mic-42',
      micRelaxed: true,
    });
    await settle();

    expect(h.capture.options?.deviceId).toBe('mic-42');
    expect(h.capture.options?.relaxed).toBe(true);
  });

  it('swaps the input device without reconnecting the Live socket', async () => {
    const { session } = await openSession();
    const socketUrl = ws.url;
    const before = h.capture.started;

    await session.setInputDevice('mic-7');
    expect(h.capture.started).toBe(before + 1);
    expect(h.capture.options?.deviceId).toBe('mic-7');
    expect(MockWebSocket.instances.length).toBe(1);
    expect(ws.url).toBe(socketUrl);
  });

  it('reopens capture in relaxed processing mode when the mic is silent', async () => {
    const { session } = await openSession();

    await session.reconnectMic(true);
    expect(h.capture.options?.relaxed).toBe(true);
  });
});

/**
 * Regression guard for the failure that killed the Live path on 11 Nov:
 * `/api/session` is rate limited, a 429 used to abort the whole call, and the
 * generic "could not connect" banner hid the real reason.
 */
describe('LiveSession token minting', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    h.capture.started = 0;
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  const callbacks = () => ({
    onStateChange: vi.fn(),
    onUserTranscript: vi.fn(),
    onBotTranscript: vi.fn(),
    onToolEvent: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
    onTurnComplete: vi.fn(),
    onDiagnostics: vi.fn(),
    onVoiceActivity: vi.fn(),
  });

  it('retries a rate-limited mint and succeeds', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return {
          status: 429,
          json: async () => ({
            ok: false,
            error: 'RATE_LIMITED',
            message: 'Token server busy. Retry in 42s.',
          }),
        };
      }
      return {
        status: 200,
        json: async () => ({
          ok: true,
          token: 'minted-token',
          model: 'gemini-3.8-live',
          apiVersion: 'v1beta',
          toolEvents: [],
        }),
      };
    }) as any;

    const session = new LiveSession(callbacks());
    await session.start({ language: 'en', mode: 'reactive' });

    expect(calls).toBe(2);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('does not retry a rejected request and surfaces the real reason', async () => {
    const calls: number[] = [];
    global.fetch = vi.fn(async () => {
      calls.push(1);
      return {
        status: 400,
        json: async () => ({
          ok: false,
          error: 'BAD_REQUEST',
          message: 'Invalid language.',
        }),
      };
    }) as any;

    const cb = callbacks();
    const session = new LiveSession(cb);

    await expect(session.start({ language: 'en', mode: 'reactive' })).rejects.toThrow(
      /Invalid language/
    );
    expect(calls).toHaveLength(1);
    // The reason must reach the caller, not a generic string.
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining('Invalid language'));
  });

  it('surfaces the real reason after exhausting the retries', async () => {
    global.fetch = vi.fn(async () => ({
      status: 500,
      json: async () => ({
        ok: false,
        error: 'MINT_FAILED',
        message: 'Failed to mint ephemeral token: upstream 500',
      }),
    })) as any;

    const session = new LiveSession(callbacks());
    await expect(session.start({ language: 'en', mode: 'reactive' })).rejects.toThrow(
      /upstream 500/
    );
    // 4 attempts: the first plus three retries.
    expect((global.fetch as any).mock.calls.length).toBe(4);
  }, 20000);
});
