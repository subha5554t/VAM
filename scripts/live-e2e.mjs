/**
 * Real end-to-end proof for the Gemini Live speech loop.
 *
 * Unlike the unit tests (which use a mocked WebSocket), this script:
 *   1. mints a real ephemeral token from the running API,
 *   2. opens the real BidiGenerateContentConstrained socket,
 *   3. streams a REAL 16 kHz PCM speech clip,
 *   4. executes the tool calls the model makes, and
 *   5. waits for real 24 kHz audio back.
 *
 * Node 20 needs --experimental-websocket:
 *   node --experimental-websocket scripts/live-e2e.mjs
 *
 * `--fast` runs a microphone-free self-test (mint -> socket -> setupComplete
 * -> first audio + first tool call). Run this 5 minutes before recording the
 * demo to prove the Live path is green:
 *   node --experimental-websocket scripts/live-e2e.mjs --fast
 *
 * Optional: PCM clip path as arg 1 (16 kHz, 16-bit mono little-endian).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const API = process.env.API_BASE || 'http://localhost:8080';
const DEFAULT_PCM =
  'C:/Users/VICTUS/AppData/Local/Temp/opencode/hello.pcm';

const FAST = process.argv.includes('--fast');
const pcmPath = resolve(process.argv[2] || DEFAULT_PCM);
const LANG = process.env.E2E_LANG || 'hinglish';

if (typeof WebSocket === 'undefined') {
  console.error(
    'FATAL: no global WebSocket. Run with: node --experimental-websocket scripts/live-e2e.mjs'
  );
  process.exit(1);
}
if (!FAST && !existsSync(pcmPath)) {
  console.error(`FATAL: PCM clip not found at ${pcmPath}`);
  process.exit(1);
}

const pcm = FAST ? Buffer.alloc(0) : readFileSync(pcmPath);
const T0 = Date.now();
const marks = {};
const mark = (name) => {
  if (!marks[name]) marks[name] = Date.now() - T0;
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

function log(...args) {
  console.log(`[${String(Date.now() - T0).padStart(6)}ms]`, ...args);
}

// ---------------------------------------------------------------- 1. token
log('POST /api/session');
const sessionRes = await fetch(`${API}/api/session`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ language: LANG, mode: 'reactive' }),
});
const session = await sessionRes.json();
mark('token');
if (!session.ok) {
  console.error('Token mint failed:', session);
  process.exit(1);
}
log(`token ok in ${marks.token}ms; warm-up tools = ${session.toolEvents?.map((e) => e.name).join(', ')}`);
check('server pre-computes diagnosis tools', (session.toolEvents?.length || 0) === 2,
  (session.toolEvents || []).map((e) => `${e.name}:${e.ms}ms`).join(', '));

// ---------------------------------------------------------------- 2. connect
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${session.apiVersion}.GenerativeService.BidiGenerateContentConstrained?access_token=${session.token}`;
const ws = new WebSocket(url);

let audioBytes = 0;
let audioChunks = 0;
let inputTranscript = '';
let outputTranscript = '';
let toolCalls = [];
let sawSetupComplete = false;
let sawInterrupted = false;
let pendingToolResponses = 0;
const activities = [];

const done = new Promise((resolveDone, rejectDone) => {
  const timeout = setTimeout(() => rejectDone(new Error('Timed out after 90s')), 90000);

  ws.onopen = () => {
    mark('wsOpen');
    log('WebSocket open');
    ws.send(JSON.stringify({ setup: { model: `models/${session.model}` } }));
  };

  ws.onerror = (e) => {
    clearTimeout(timeout);
    rejectDone(new Error(`WebSocket error: ${e.message || e.type || 'unknown'}`));
  };

  ws.onclose = (e) => {
    if (!sawSetupComplete) {
      clearTimeout(timeout);
      rejectDone(new Error(`Socket closed early: code=${e.code} reason=${e.reason}`));
    }
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text());
    } catch {
      return;
    }

    if (msg.setupComplete) {
      sawSetupComplete = true;
      mark('setupComplete');
      log('setupComplete');
      startConversation();
      return;
    }

    if (msg.serverContent?.interrupted) {
      sawInterrupted = true;
      log('serverContent.interrupted');
    }

    if (msg.serverContent?.inputTranscription?.text) {
      mark('firstInputTx');
      inputTranscript += msg.serverContent.inputTranscription.text;
      log(`IN_TX: ${JSON.stringify(msg.serverContent.inputTranscription.text)}`);
    }

    if (msg.serverContent?.outputTranscription?.text) {
      mark('firstOutputTx');
      outputTranscript += msg.serverContent.outputTranscription.text;
      log(`OUT_TX: ${JSON.stringify(msg.serverContent.outputTranscription.text)}`);
    }

    if (msg.serverContent?.modelTurn?.parts) {
      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          mark('firstAudio');
          audioChunks++;
          audioBytes += Buffer.from(part.inlineData.data, 'base64').length;
        }
      }
    }

    if (msg.serverContent?.turnComplete) {
      log('turnComplete');
    }

    if (msg.toolCall?.functionCalls) {
      mark('firstToolCall');
      for (const fc of msg.toolCall.functionCalls) {
        toolCalls.push(fc.name);
        log(`TOOL_CALL: ${fc.name} ${JSON.stringify(fc.args)}`);
      }
      void respondToTools(msg.toolCall.functionCalls);
    }

    if (msg.goAway) log('goAway');

    // Give the model a moment to finish speaking, then evaluate.
    // In --fast mode there is no seller audio, so the model only greets: the
    // signal that the Live path works is "it spoke and transcribed itself".
    const ready = FAST
      ? audioChunks > 0 && outputTranscript.trim().length > 0
      : audioChunks > 0 && toolCalls.length > 0;

    if (ready && pendingToolResponses === 0) {
      setTimeout(() => {
        clearTimeout(timeout);
        resolveDone();
      }, FAST ? 3000 : 6000);
    }
  };
});

async function startConversation() {
  // Ask Asha to open the call (mirrors what the browser does).
  ws.send(
    JSON.stringify({
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: 'Call connected. Open now with your grounded greeting from VERIFIED FACTS, then ask exactly ONE question about the cause. Do not call any tool first.',
              },
            ],
          },
        ],
        turnComplete: true,
      },
    })
  );

  // Start streaming the real microphone clip shortly after, like a seller
  // who begins speaking once Asha finishes her opener.
  if (!FAST) setTimeout(() => streamPcm(), 5500);
}

async function respondToTools(functionCalls) {
  pendingToolResponses += functionCalls.length;
  const responses = [];
  try {
    for (const fc of functionCalls) {
      const args = { ...(fc.args || {}) };
      if (!args.sellerId && fc.name !== 'advance_stage') args.sellerId = 'SD-48213';

      const res = await fetch(`${API}/api/tools/${fc.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const json = await res.json();
      responses.push({
        id: fc.id,
        name: fc.name,
        response: { result: json.data ?? { error: json.error } },
      });
      log(`TOOL_OK: ${fc.name} ok=${json.ok} in ${json._executionMs}ms`);
    }
  } catch (err) {
    log(`TOOL_ERR: ${err.message}`);
  } finally {
    pendingToolResponses -= functionCalls.length;
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
  }
}

/** Streams the PCM clip at real-time pace (32 kB/s = 100 ms per 3200 bytes). */
async function streamPcm() {
  const CHUNK = 3200; // 100 ms of 16 kHz mono 16-bit
  log(`streaming ${pcm.length} bytes of real speech (${(pcm.length / 32000).toFixed(2)}s)`);
  for (let offset = 0; offset < pcm.length; offset += CHUNK) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const slice = pcm.subarray(offset, Math.min(offset + CHUNK, pcm.length));
    ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: { mimeType: 'audio/pcm;rate=16000', data: slice.toString('base64') },
        },
      })
    );
    await new Promise((r) => setTimeout(r, 100));
  }
  mark('audioSent');
  // Explicit end-of-stream so the server commits the buffered audio.
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  }
  log('audioStreamEnd sent');

  // The clip only proves the microphone path ("can you hear me?"). Asha then
  // asks what caused the drop, so answer it — that is the turn where a real
  // KAM calls the diagnostic tools, and it makes the tool check deterministic.
  setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    log('sending seller answer (text turn)');
    ws.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: 'Haan, supplier ko payment karne mein 10 din lag rahe hain, aur do orders stock na hone ki wajah se cancel hue hain.',
                },
              ],
            },
          ],
          turnComplete: true,
        },
      })
    );
  }, 7000);
}

try {
  await done;
} catch (err) {
  console.error('E2E error:', err.message);
}

try {
  ws.close();
} catch {}

console.log('\n================ LATENCY ================');
for (const [k, v] of Object.entries(marks)) console.log(`  ${k.padEnd(16)} ${v}ms`);

console.log('\n================ RESULT ================');
check('setupComplete received', sawSetupComplete);
check('model spoke (24 kHz audio received)', audioBytes > 0, `${audioChunks} chunks / ${audioBytes} bytes`);
if (FAST) {
  // No microphone audio is streamed in --fast mode, so there is no input
  // transcription and no seller turn to trigger a tool call.
  check('model transcript received', outputTranscript.trim().length > 0, JSON.stringify(outputTranscript.trim().slice(0, 160)));
  console.log(`INFO  tool calls in greeting: ${toolCalls.length ? toolCalls.join(', ') : 'none (expected without a seller turn)'}`);
} else {
  check('user speech transcribed (mic path works)', inputTranscript.trim().length > 0, JSON.stringify(inputTranscript.trim().slice(0, 160)));
  check('model transcript received', outputTranscript.trim().length > 0, JSON.stringify(outputTranscript.trim().slice(0, 160)));
  check('model called business tools', toolCalls.length > 0, toolCalls.join(', '));
  check('barge-in/interrupt channel alive', sawInterrupted, sawInterrupted ? 'serverContent.interrupted seen' : 'not triggered this run');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
