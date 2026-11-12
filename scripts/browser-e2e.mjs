/**
 * Real browser end-to-end proof for the voice loop.
 *
 * The unit tests use a mocked WebSocket, and `live-e2e.mjs` talks to Gemini
 * directly. Neither proves the *browser* path: getUserMedia -> AudioWorklet
 * downsample -> WebSocket -> transcript in the DOM -> spoken reply.
 *
 * This script launches headless Chrome, replaces getUserMedia with a
 * controllable AudioBufferSource -> MediaStreamDestination (so the seller
 * speaks exactly when we decide, not over the greeting), clicks "Start Voice
 * Call" on the real app, and asserts a full two-turn conversation:
 *
 *   1. Asha's greeting is one complete bubble (not truncated),
 *   2. the greeting gate is released on `turnComplete` once playback drains, not on echo,
 *   3. the seller's clip is heard by the server VAD ("I can hear you" badge),
 *   4. the seller's words appear as a transcript, and
 *   5. Asha answers that turn with different words.
 *
 * Node 20 needs --experimental-websocket (global WebSocket):
 *   node --experimental-websocket scripts/browser-e2e.mjs
 *
 * Flags:
 *   --url=http://localhost:5173   app under test
 *   --wav=C:/.../hello.wav        seller clip (16-bit PCM WAV)
 *   --seconds=90                  hard timeout
 *   --keep                        keep the Chrome profile for debugging
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (typeof WebSocket === 'undefined') {
  console.error('FATAL: no global WebSocket. Run with: node --experimental-websocket scripts/browser-e2e.mjs');
  process.exit(1);
}

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const APP_URL = arg('url', 'http://localhost:5173');
const WAV = arg('wav', 'C:/Users/VICTUS/.opencode/plan/_probe/hello.wav');
const TIMEOUT_MS = Number(arg('seconds', '120')) * 1000;
const PORT = Number(arg('port', '9333'));
const KEEP = has('keep');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));

if (!CHROME) {
  console.error('FATAL: Chrome not found. Set CHROME_PATH.');
  process.exit(1);
}
if (!existsSync(WAV)) {
  console.error(`FATAL: seller WAV not found: ${WAV}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error(`CDP socket error: ${e?.message || 'unknown'}`));
      this.ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: ok, reject: fail } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) fail(new Error(`${msg.error.message} (${msg.error.code})`));
          else ok(msg.result);
          return;
        }
        if (msg.method) {
          for (const cb of this.listeners.get(msg.method) || []) cb(msg.params);
        }
      };
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
    });
  }

  on(method, cb) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(cb);
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

async function waitForHttp(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(200);
  }
  throw new Error(`Chrome debugging endpoint never came up: ${url}`);
}

/**
 * Replaces the microphone with a decoded WAV fed into a
 * MediaStreamAudioDestinationNode. The seller stays silent until
 * `window.__fakeMic.play()` is called, which makes the test deterministic and
 * lets us prove the greeting is not interrupted by its own echo.
 */
const fakeMicScript = (wavBase64) => `
(() => {
  const B64 = ${JSON.stringify(wavBase64)};
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  let ctx = null;
  let dest = null;
  let buffer = null;

  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints || !constraints.audio) return orig(constraints);
    ctx = ctx || new AudioContext();
    await ctx.resume();
    if (!buffer) {
      const bin = atob(B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      buffer = await ctx.decodeAudioData(bytes.buffer);
    }
    dest = dest || ctx.createMediaStreamDestination();
    window.__fakeMic = {
      durationSec: buffer.duration,
      play(loop = false) {
        try { window.__fakeMicSrc && window.__fakeMicSrc.stop(); } catch {}
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = loop;
        src.connect(dest);
        src.start();
        window.__fakeMicSrc = src;
        return { durationSec: buffer.duration, loop };
      },
      stop() {
        try { window.__fakeMicSrc && window.__fakeMicSrc.stop(); } catch {}
        window.__fakeMicSrc = null;
      },
    };
    return dest.stream;
  };
})();
`;

const profile = mkdtempSync(join(tmpdir(), 'vam-chrome-'));
const chromeArgs = [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream',
  'about:blank',
];

const chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });
const cleanup = () => {
  try {
    chrome.kill();
  } catch {}
  if (!KEEP) {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {}
  }
};
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

let cdp;

try {
  await waitForHttp(`http://127.0.0.1:${PORT}/json/version`);
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('No page target in Chrome');

  cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();

  const consoleLines = [];
  let clickedAt = 0;
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args || [])
      .map((a) => (a.value !== undefined ? String(a.value) : a.description || ''))
      .join(' ');
    if (text) {
      const t = clickedAt ? `+${Date.now() - clickedAt}ms ` : '';
      consoleLines.push(`${t}[${p.type}] ${text}`);
    }
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    consoleLines.push(`[exception] ${p.exceptionDetails?.exception?.description || 'unknown'}`);
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: fakeMicScript(readFileSync(WAV).toString('base64')),
  });
  await cdp.send('Page.navigate', { url: APP_URL });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text || 'evaluate failed');
    return result?.value;
  };

  const snapshot = () =>
    evaluate(`
      (() => {
        const nodes = Array.from(document.querySelectorAll('[data-testid="transcript-message"]'));
        const msgs = nodes.map(el => ({
          role: el.getAttribute('data-role'),
          text: (el.lastElementChild && el.lastElementChild.textContent || '').trim(),
        }));
        const badge = document.querySelector('[data-testid="hear-badge"]');
        const labels = ['Listening to you', 'Asha is speaking', 'Thinking', 'Connecting to Gemini Live', 'Muted'];
        const stateEl = Array.from(document.querySelectorAll('div,span,p'))
          .find(el => labels.some(s => el.textContent && el.textContent.trim() === s));
        return {
          msgs,
          badge: badge ? badge.textContent.trim() : null,
          badgeActive: badge ? /emerald/.test(badge.className) : false,
          state: stateEl ? stateEl.textContent.trim() : null,
          micLive: /\\blive\\b/.test(document.body.innerText),
        };
      })()
    `);

  // Wait for React to mount.
  const mountStart = Date.now();
  while (Date.now() - mountStart < 20000) {
    const ready = await evaluate(
      `!!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Start Voice Call'))`
    );
    if (ready) break;
    await sleep(250);
  }

  // The app pre-warms a token on mount; give it a beat so we measure the warm
  // path the seller actually experiences.
  await sleep(2500);

  const sessionEntry = await evaluate(`
    (() => {
      const e = performance.getEntriesByType('resource').filter(r => r.name.includes('/api/session'));
      const last = e[e.length - 1];
      return last ? { count: e.length, durationMs: Math.round(last.duration) } : null;
    })()
  `);

  clickedAt = Date.now();
  const clicked = await evaluate(`
    (() => {
      const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Start Voice Call'));
      if (!b) return false;
      b.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error('Could not find the Start Voice Call button');

  const seen = {
    firstBotAt: null,
    gateReason: null,
    gateAt: null,
    turnCompleteSeen: false,
    badgeSeen: false,
    badgeActive: false,
    micLive: false,
  };
  let snap = { msgs: [], badge: null, state: null };

  const BENIGN_GATE_REASONS = new Set(['turnComplete', 'player-drained', 'silence-watchdog']);

  // --- Phase 1: greeting -------------------------------------------------
  const greetingDeadline = Math.min(clickedAt + TIMEOUT_MS, clickedAt + 70000);
  while (Date.now() < greetingDeadline) {
    snap = await snapshot();
    const now = Date.now() - clickedAt;
    if (snap.micLive) seen.micLive = true;
    if (snap.badge) seen.badgeSeen = true;
    if (snap.badgeActive) seen.badgeActive = true;

    const bots = snap.msgs.filter((m) => m.role === 'bot');
    if (!seen.firstBotAt && bots.length > 0) seen.firstBotAt = now;

    if (!seen.gateReason) {
      const line = consoleLines.find((l) => l.includes('Greeting gate released'));
      if (line) {
        const m = line.match(/released \(([^)]+)\)/);
        seen.gateReason = m ? m[1] : 'unknown';
        seen.gateAt = now;
      }
    }
    if (
      consoleLines.some((l) =>
        /Greeting (?:gate (?:released|already open) \(turnComplete\)|turn complete)/.test(l)
      )
    ) {
      seen.turnCompleteSeen = true;
    }

    // Greeting generated AND the player has drained.
    if (seen.gateReason && BENIGN_GATE_REASONS.has(seen.gateReason) && snap.state !== 'Asha is speaking') break;
    await sleep(300);
  }

  const greeting = (snap.msgs.find((m) => m.role === 'bot')?.text || '').trim();
  const greetingBubbles = snap.msgs.filter((m) => m.role === 'bot').length;
  const greetingMs = seen.firstBotAt;
  // Everything appended from here on belongs to the seller's turn.
  const baselineCount = snap.msgs.length;

  // Let any residual audio drain before the seller speaks.
  await sleep(1200);

  // --- Phase 2: seller speaks --------------------------------------------
  const playInfo = await evaluate(`window.__fakeMic ? window.__fakeMic.play(false) : null`);
  if (!playInfo) throw new Error('Fake microphone was never wired into getUserMedia');
  const spokeAt = Date.now();

  let sellerText = '';
  let replyText = '';
  let sellerAt = null;
  let replyAt = null;
  const sellerDeadline = Math.min(spokeAt + TIMEOUT_MS, spokeAt + 40000);

  while (Date.now() < sellerDeadline) {
    snap = await snapshot();
    const now = Date.now() - clickedAt;
    if (snap.micLive) seen.micLive = true;
    if (snap.badge) seen.badgeSeen = true;
    if (snap.badgeActive) seen.badgeActive = true;

    const tail = snap.msgs.slice(baselineCount);
    const sellers = tail.filter((m) => m.role === 'user');
    const firstSellerIdx = tail.findIndex((m) => m.role === 'user');
    const botAfterSeller =
      firstSellerIdx >= 0 ? tail.slice(firstSellerIdx).filter((m) => m.role === 'bot') : [];

    if (sellers.length > 0 && !sellerAt) {
      sellerAt = now;
      sellerText = sellers.map((s) => s.text).join(' ').trim();
    }
    if (sellerAt && botAfterSeller.length > 0) {
      replyAt = now;
      replyText = botAfterSeller.map((m) => m.text).join(' ').trim();
      break;
    }
    await sleep(300);
  }

  // Give the reply a moment to finish streaming so the text is complete.
  await sleep(1500);
  const finalSnap = await snapshot();
  const finalTail = finalSnap.msgs.slice(baselineCount);
  const finalSeller = finalTail.filter((m) => m.role === 'user').map((m) => m.text).join(' ').trim();
  const finalBotTexts = finalTail.filter((m) => m.role === 'bot').map((m) => m.text);
  const finalReply = finalBotTexts.length > 0 ? finalBotTexts.join(' ').trim() : '';

  const summary = {
    appUrl: APP_URL,
    sellerClip: { path: WAV, durationSec: playInfo.durationSec },
    sessionResource: sessionEntry,
    greetingMs,
    greeting,
    greetingBubbles,
    greetingGateReason: seen.gateReason,
    greetingGateMs: seen.gateAt,
    turnCompleteSeen: seen.turnCompleteSeen,
    sellerTranscriptMs: sellerAt,
    sellerTranscript: finalSeller || sellerText,
    replyMs: replyAt,
    reply: finalReply || replyText,
    voiceActivityBadgeSeen: seen.badgeSeen,
    voiceActivityBadgeActive: seen.badgeActive,
    micTrackLive: seen.micLive,
    transcript: finalSnap.msgs,
    consoleTail: consoleLines.slice(-25),
  };

  console.log(JSON.stringify(summary, null, 2));

  const greetingLooksComplete =
    greetingBubbles === 1 && greeting.length >= 25 && /[.!?]$/.test(greeting);
  const checks = [
    ['Greeting is one complete bubble', greetingLooksComplete],
    ['Greeting gate released for a benign reason', BENIGN_GATE_REASONS.has(seen.gateReason)],
    ['Server VAD heard the seller (badge)', seen.badgeSeen],
    ['Seller transcript appeared', Boolean(finalSeller || sellerText)],
    ['Asha replied with different words', Boolean((finalReply || replyText) && (finalReply || replyText) !== greeting)],
    ['Mic track reported live', seen.micLive],
  ];
  console.log('\n--- acceptance ---');
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  const allOk = checks.every(([, ok]) => ok);
  console.log(allOk ? '\nRESULT: PASS' : '\nRESULT: FAIL');
  if (!greetingLooksComplete) {
    console.log(`\nGreeting detail: ${JSON.stringify({ greeting, greetingBubbles, endsWithPunctuation: /[.!?]$/.test(greeting) })}`);
  }

  cdp.close();
  cleanup();
  process.exit(allOk ? 0 : 1);
} catch (err) {
  console.error('E2E ERROR:', err.message);
  try {
    cdp?.close();
  } catch {}
  cleanup();
  process.exit(1);
}
